'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ClipboardCheck, Download, ExternalLink, History, Loader2, Package, Save, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/components/accounting/api'
import { formatDateTimeCO } from '@/lib/accounting/format'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui'
import { inputClass, type StockProduct, type StockResponse } from './types'

type CountRow = { productId: string; name: string; theoretical: number; counted: number; difference: number }
type CountTotals = { products: number; theoretical: number; counted: number; difference: number; withDifference: number }
type CountReport = { id: string; rows: CountRow[]; totals: CountTotals; notes: string; performedAt: string; performedBy: string }
type HistoryItem = { id: string; shortId: string; performedAt: string; performedBy: string; totals: CountTotals; notes: string }

const signed = (value: number) => value > 0 ? `+${value}` : String(value)
const differenceClass = (value: number) => value < 0 ? 'text-red-700' : value > 0 ? 'text-green-700' : 'text-gray-500'
const pdfUrl = (id: string, attachment = false) => `/api/inventory/counts/${encodeURIComponent(id)}/pdf${attachment ? '?disposition=attachment' : ''}`

export default function BulkCount() {
  const [products, setProducts] = useState<StockProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [step, setStep] = useState<'pick' | 'count'>('pick')
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [report, setReport] = useState<CountReport | null>(null)
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [historyError, setHistoryError] = useState('')

  const loadProducts = useCallback(async () => {
    setLoading(true); setError('')
    try { setProducts((await api<StockResponse>('/api/inventory/stock?active=1')).products) }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])
  const loadHistory = useCallback(async () => {
    setHistoryError('')
    try { setHistory((await api<{ counts: HistoryItem[] }>('/api/inventory/counts')).counts) }
    catch (e) { setHistoryError((e as Error).message) }
  }, [])
  useEffect(() => { void loadProducts(); void loadHistory() }, [loadProducts, loadHistory])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter(p => !term || `${p.name} ${p.description || ''}`.toLowerCase().includes(term))
  }, [products, search])
  const selectedProducts = useMemo(() => selected.map(id => products.find(p => p.id === id)).filter((p): p is StockProduct => !!p), [selected, products])
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.includes(p.id))
  const toggleFiltered = () => setSelected(current => allFilteredSelected ? current.filter(id => !filtered.some(p => p.id === id)) : Array.from(new Set([...current, ...filtered.map(p => p.id)])))

  // Validation of the physical quantities: every selected product needs a whole number ≥ 0.
  const parsedRows = selectedProducts.map(p => { const raw = (counted[p.id] ?? '').trim(); const value = raw === '' ? null : Number(raw); return { product: p, raw, value: value !== null && Number.isInteger(value) && value >= 0 ? value : null } })
  const invalid = parsedRows.filter(row => row.value === null)
  const liveTotals = parsedRows.reduce((acc, row) => row.value === null ? acc : { theoretical: acc.theoretical + row.product.stock, counted: acc.counted + row.value, difference: acc.difference + (row.value - row.product.stock), withDifference: acc.withDifference + (row.value !== row.product.stock ? 1 : 0) }, { theoretical: 0, counted: 0, difference: 0, withDifference: 0 })

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const result = await api<CountReport>('/api/inventory/counts', { method: 'POST', json: { items: parsedRows.map(row => ({ productId: row.product.id, counted: row.value })), notes: notes.trim() } })
      setConfirming(false); setReport(result)
      toast.success(`Conteo registrado: ${result.totals.products} productos, diferencia neta ${signed(result.totals.difference)}`)
      void loadHistory(); void loadProducts()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  function reset() { setReport(null); setSelected([]); setCounted({}); setNotes(''); setStep('pick'); setSearch('') }

  return <div className="space-y-6">
    <section className="rounded-lg bg-white p-5 shadow">
      {report ? <>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><ClipboardCheck className="h-5 w-5 text-primary-600" /> Conteo registrado</h2>
            <p className="mt-1 text-sm text-gray-600">{formatDateTimeCO(report.performedAt)} · {report.performedBy}. Las existencias quedaron ajustadas al valor físico.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={pdfUrl(report.id, true)} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"><Download className="h-4 w-4" /> Descargar PDF</a>
            <a href={pdfUrl(report.id)} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"><ExternalLink className="h-4 w-4" /> Ver PDF</a>
            <Button variant="outline" onClick={reset}>Nuevo conteo</Button>
          </div>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[['Productos', String(report.totals.products), ''], ['Teórico', String(report.totals.theoretical), ''], ['Físico', String(report.totals.counted), ''], ['Diferencia', signed(report.totals.difference), differenceClass(report.totals.difference)], ['Con diferencia', String(report.totals.withDifference), '']].map(([label, value, cls]) => <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${cls || 'text-gray-900'}`}>{value}</p></div>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-2">Producto</th><th className="px-4 py-2 text-right">Teórico</th><th className="px-4 py-2 text-right">Físico</th><th className="px-4 py-2 text-right">Diferencia</th></tr></thead>
            <tbody className="divide-y divide-gray-200">{report.rows.map(row => <tr key={row.productId} className={row.difference !== 0 ? 'bg-amber-50/40' : ''}><td className="px-4 py-2 text-gray-900">{row.name}</td><td className="px-4 py-2 text-right tabular-nums">{row.theoretical}</td><td className="px-4 py-2 text-right tabular-nums">{row.counted}</td><td className={`px-4 py-2 text-right font-semibold tabular-nums ${differenceClass(row.difference)}`}>{signed(row.difference)}</td></tr>)}</tbody>
          </table>
        </div>
        {report.notes && <p className="mt-3 text-sm text-gray-600"><span className="font-medium">Observaciones:</span> {report.notes}</p>}
      </> : <>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Nuevo conteo masivo</h2>
            <p className="mt-1 text-sm text-gray-600">{step === 'pick' ? 'Paso 1: marca los productos que vas a contar.' : 'Paso 2: registra las unidades físicas encontradas; la diferencia se ajusta al guardar.'}</p>
          </div>
          <ol className="flex items-center gap-2 text-xs font-medium">
            {[['pick', '1. Productos'], ['count', '2. Cantidades']].map(([id, label]) => <li key={id} className={`rounded-full px-3 py-1 ${step === id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{label}</li>)}
          </ol>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error} <button type="button" className="underline" onClick={() => void loadProducts()}>Reintentar</button></p>}
        {step === 'pick' ? <>
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className={`${inputClass} pl-9`} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={allFilteredSelected} disabled={!filtered.length} onChange={toggleFiltered} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" /> Seleccionar todos los filtrados ({filtered.length})</label>
            <span className="text-sm font-medium text-primary-700">{selected.length} seleccionado{selected.length === 1 ? '' : 's'}</span>
          </div>
          {loading ? <div className="p-10 text-center text-gray-500"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Cargando productos…</div>
            : filtered.length === 0 ? <div className="p-10 text-center"><Package className="mx-auto mb-3 h-10 w-10 text-gray-300" /><p className="text-gray-500">No hay productos{search ? ' que coincidan' : ' activos'}</p></div>
            : <ul className="max-h-[28rem] divide-y divide-gray-200 overflow-y-auto rounded-lg border border-gray-200">
              {filtered.map(p => <li key={p.id}><label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>{p.description && <span className="block truncate text-xs text-gray-500">{p.description}</span>}</span>
                <span className="text-sm tabular-nums text-gray-600">{p.stock} en bodega</span>
              </label></li>)}
            </ul>}
          <div className="mt-4 flex justify-end">
            <Button disabled={!selected.length} onClick={() => setStep('count')}>Continuar <ArrowRight size={16} /></Button>
          </div>
        </> : <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-2">Producto</th><th className="px-4 py-2 text-right">Teórico</th><th className="px-4 py-2 text-right">Físico</th><th className="px-4 py-2 text-right">Diferencia</th></tr></thead>
              <tbody className="divide-y divide-gray-200">
                {parsedRows.map(({ product: p, raw, value }) => <tr key={p.id}>
                  <td className="px-4 py-2"><span className="block font-medium text-gray-900">{p.name}</span>{p.description && <span className="block text-xs text-gray-500">{p.description}</span>}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700">{p.stock}</td>
                  <td className="px-4 py-2 text-right"><input type="number" inputMode="numeric" min={0} step={1} required value={raw} aria-label={`Unidades físicas de ${p.name}`} aria-invalid={raw !== '' && value === null} onChange={e => setCounted(current => ({ ...current, [p.id]: e.target.value }))} className={`${inputClass} w-28 text-right tabular-nums ${raw !== '' && value === null ? 'border-red-400' : ''}`} placeholder="0" /></td>
                  <td className={`px-4 py-2 text-right font-semibold tabular-nums ${value === null ? 'text-gray-400' : differenceClass(value - p.stock)}`}>{value === null ? '—' : signed(value - p.stock)}</td>
                </tr>)}
              </tbody>
              <tfoot className="bg-gray-50 text-sm font-semibold"><tr><td className="px-4 py-2 text-right text-gray-600">Totales</td><td className="px-4 py-2 text-right tabular-nums">{liveTotals.theoretical}</td><td className="px-4 py-2 text-right tabular-nums">{liveTotals.counted}</td><td className={`px-4 py-2 text-right tabular-nums ${differenceClass(liveTotals.difference)}`}>{signed(liveTotals.difference)}</td></tr></tfoot>
            </table>
          </div>
          <label className="mt-4 block text-sm font-medium text-gray-700">Observaciones (opcional)
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={1000} placeholder="Responsables, bodega, novedades…" className={`${inputClass} mt-1`} />
          </label>
          {invalid.length > 0 && <p className="mt-2 text-xs text-amber-700">Faltan cantidades válidas (enteros ≥ 0) en {invalid.length} producto{invalid.length === 1 ? '' : 's'}.</p>}
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => setStep('pick')}><ArrowLeft size={16} /> Cambiar productos</Button>
            <Button disabled={!parsedRows.length || invalid.length > 0 || saving} onClick={() => setConfirming(true)}><Save size={16} /> Guardar conteo</Button>
          </div>
        </>}
      </>}
    </section>

    <section className="rounded-lg bg-white p-5 shadow">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900"><History className="h-5 w-5 text-primary-600" /> Historial de conteos</h2>
      {historyError ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{historyError} <button type="button" className="underline" onClick={() => void loadHistory()}>Reintentar</button></p>
        : history === null ? <p className="text-sm text-gray-500">Cargando historial…</p>
        : history.length === 0 ? <p className="text-sm text-gray-500">Aún no se han registrado conteos masivos.</p>
        : <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-2">Fecha</th><th className="px-4 py-2">Usuario</th><th className="px-4 py-2 text-right">Productos</th><th className="px-4 py-2 text-right">Con diferencia</th><th className="px-4 py-2 text-right">Diferencia neta</th><th className="px-4 py-2">PDF</th></tr></thead>
            <tbody className="divide-y divide-gray-200">{history.map(item => <tr key={item.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-2 text-gray-700">{formatDateTimeCO(item.performedAt)}<span className="block text-xs text-gray-400">{item.shortId}</span></td>
              <td className="px-4 py-2 text-gray-700">{item.performedBy}</td>
              <td className="px-4 py-2 text-right tabular-nums">{item.totals.products}</td>
              <td className="px-4 py-2 text-right tabular-nums">{item.totals.withDifference}</td>
              <td className={`px-4 py-2 text-right font-semibold tabular-nums ${differenceClass(item.totals.difference)}`}>{signed(item.totals.difference)}</td>
              <td className="whitespace-nowrap px-4 py-2"><a href={pdfUrl(item.id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary-600 hover:underline"><ExternalLink className="h-4 w-4" /> Ver</a> <a href={pdfUrl(item.id, true)} className="ml-2 inline-flex items-center gap-1 text-primary-600 hover:underline"><Download className="h-4 w-4" /> Descargar</a></td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>

    <Dialog open={confirming} onOpenChange={open => { if (!open && !saving) setConfirming(false) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Guardar conteo</DialogTitle><DialogDescription>Se registrarán {parsedRows.length} conteo{parsedRows.length === 1 ? '' : 's'} y se ajustarán las existencias al valor físico (diferencia neta {signed(liveTotals.difference)}, {liveTotals.withDifference} producto{liveTotals.withDifference === 1 ? '' : 's'} con diferencia). Esta acción queda en el kardex.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void save()}>{saving ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : <><Save size={16} /> Confirmar conteo</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
}
