'use client'
import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui'
import { api } from './api'
import { formatMoney, toCents } from '@/lib/accounting/format'
import type { ImportRow, ImportAction } from '@/lib/accounting/product-import'

type Plan = { fileName: string; rows: ImportRow[]; summary: Record<ImportAction, number> }
const actionLabel: Record<ImportAction, string> = { create: 'Crear', update: 'Actualizar', skip: 'Omitir', error: 'Error' }
const actionClass: Record<ImportAction, string> = { create: 'bg-green-100 text-green-800', update: 'bg-blue-100 text-blue-800', skip: 'bg-gray-100 text-gray-700', error: 'bg-red-100 text-red-800' }

/** Export, template and two-step import (preview, then apply) of the product catalog as Excel. */
export function ProductImport({ onImported, disabled }: { onImported: () => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [reading, setReading] = useState(false)
  const [applying, setApplying] = useState(false)

  async function preview(file: File) {
    setReading(true)
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch('/api/products/import', { method: 'POST', body })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo leer el archivo')
      setPlan(data)
    } catch (e) { toast.error((e as Error).message) }
    finally { setReading(false); if (input.current) input.current.value = '' }
  }
  async function apply() {
    if (!plan || applying) return
    setApplying(true)
    try {
      const result = await api<{ created: number; updated: number; skipped: number; errors: { row: number; message?: string }[] }>('/api/products/import', { method: 'PUT', json: { rows: plan.rows } })
      toast.success(`Importación terminada: ${result.created} creados, ${result.updated} actualizados${result.skipped ? `, ${result.skipped} sin cambios` : ''}`, { duration: 7000 })
      if (result.errors.length) toast(`${result.errors.length} filas con error no se importaron`, { icon: '⚠️' })
      setPlan(null); onImported()
    } catch (e) { toast.error((e as Error).message) }
    finally { setApplying(false) }
  }
  const pending = plan ? plan.summary.create + plan.summary.update : 0

  return <>
    <div className="flex flex-wrap gap-2">
      <a href="/api/products/export" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"><Download size={16} /> Exportar Excel</a>
      <a href="/api/products/import/template" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50" title="Plantilla con los encabezados y filas de ejemplo"><FileSpreadsheet size={16} /> Plantilla</a>
      <Button size="sm" variant="outline" disabled={disabled || reading} onClick={() => input.current?.click()}>{reading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {reading ? 'Leyendo…' : 'Importar Excel'}</Button>
      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void preview(file) }} />
    </div>

    <Dialog open={!!plan} onOpenChange={open => { if (!open && !applying) setPlan(null) }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar productos</DialogTitle>
          <DialogDescription>{plan?.fileName}: {plan?.summary.create} por crear, {plan?.summary.update} por actualizar, {plan?.summary.skip} sin cambios u omitidos, {plan?.summary.error} con error. Revisa el detalle antes de confirmar; las filas con error no se importan.</DialogDescription>
        </DialogHeader>
        {plan && <div className="max-h-[55vh] overflow-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500"><tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2">Activo</th><th className="px-3 py-2">Préstamo</th><th className="px-3 py-2">Acción</th><th className="px-3 py-2">Detalle</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {plan.rows.map(row => <tr key={row.row} className={row.action === 'error' ? 'bg-red-50/50' : ''}>
                <td className="px-3 py-2 text-gray-500 tabular-nums">{row.row}</td>
                <td className="px-3 py-2"><div className="font-medium text-gray-900">{row.name || '—'}</div>{row.description && <div className="text-xs text-gray-500">{row.description}</div>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.price == null ? '—' : formatMoney(toCents(row.price))}</td>
                <td className="px-3 py-2">{row.active ? 'Sí' : 'No'}</td>
                <td className="px-3 py-2">{row.loanable ? 'Sí' : 'No'}</td>
                <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${actionClass[row.action]}`}>{actionLabel[row.action]}</span></td>
                <td className="px-3 py-2 text-xs text-gray-600">{row.message || (row.changes?.length ? `Cambia: ${row.changes.join(', ')}` : '')}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={applying} onClick={() => setPlan(null)}>Cancelar</Button>
          <Button disabled={applying || !pending} onClick={() => void apply()}>{applying ? <><Loader2 size={16} className="animate-spin" /> Importando…</> : `Importar ${pending} producto${pending === 1 ? '' : 's'}`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
