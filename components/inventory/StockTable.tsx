'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, History, Loader2, Package, PackageMinus, PackagePlus, Plus, ClipboardList, Search, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/components/accounting/api'
import { MoneyInput } from '@/components/accounting/MoneyInput'
import { formatDateTimeCO, formatMoney, toCents } from '@/lib/accounting/format'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui'
import { MovementDialog, type ManualMovementType } from './MovementDialog'
import { inputClass, type StockProduct, type StockResponse } from './types'

export default function StockTable() {
  const [data, setData] = useState<StockResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)
  const [movement, setMovement] = useState<{ product: StockProduct | null; type?: ManualMovementType } | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', description: '', priceCents: null as number | null, loanable: false })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await api<StockResponse>(`/api/inventory/stock${onlyActive ? '?active=1' : ''}`)) }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [onlyActive])
  useEffect(() => { void load() }, [load])

  const products = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.products || []).filter(p => !term || `${p.name} ${p.description || ''}`.toLowerCase().includes(term))
  }, [data, search])

  async function createProduct() {
    if (!draft.name.trim() || draft.priceCents == null || saving) { if (!draft.name.trim()) toast.error('Escribe el nombre del producto'); else if (draft.priceCents == null) toast.error('Indica el precio sugerido'); return }
    setSaving(true)
    try {
      await api('/api/products', { method: 'POST', json: { name: draft.name.trim(), description: draft.description.trim(), price: draft.priceCents / 100, active: true, loanable: draft.loanable } })
      toast.success(draft.loanable ? 'Equipo de préstamo creado. Registra una compra o entrada para darle existencias.' : 'Producto creado. Registra una compra o entrada para darle existencias.')
      setCreating(false); setDraft({ name: '', description: '', priceCents: null, loanable: false }); void load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const action = (product: StockProduct, type: ManualMovementType, label: string, Icon: typeof Plus) =>
    <button type="button" onClick={() => setMovement({ product, type })} title={label} aria-label={`${label}: ${product.name}`} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"><Icon size={14} /> {label}</button>

  return <>
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      {[
        ['Productos', data?.totals.products, Package], ['Unidades en bodega', data?.totals.units, Boxes], ['Unidades prestadas', data?.totals.loaned, PackageMinus],
      ].map(([label, value, Icon]) => {
        const I = Icon as typeof Package
        return <div key={label as string} className="flex items-center justify-between rounded-lg bg-white p-4 shadow">
          <div><p className="text-sm text-gray-500">{label as string}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{loading && !data ? '—' : (value as number) ?? 0}</p></div>
          <I className="h-8 w-8 text-primary-200" />
        </div>
      })}
    </div>
    <div className="mb-4 rounded-lg bg-white p-4 shadow">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className={`${inputClass} pl-10`} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" /> Solo activos</label>
        <Link href="?tab=counts" className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-base font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"><ClipboardList size={16} /> Conteo masivo</Link>
        <Button variant="outline" onClick={() => setMovement({ product: null })}><ClipboardList size={16} /> Registrar movimiento</Button>
        <Button onClick={() => setCreating(true)}><Plus size={16} /> Nuevo producto</Button>
      </div>
    </div>

    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
    {loading && !data ? <div className="rounded-lg bg-white p-12 text-center text-gray-500"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Cargando existencias…</div>
      : products.length === 0 ? <div className="rounded-lg bg-white p-12 text-center shadow"><Package className="mx-auto mb-3 h-10 w-10 text-gray-300" /><p className="text-lg text-gray-500">No hay productos{search ? ' que coincidan' : ''}</p><p className="mt-2 text-gray-400">{data?.products.length ? 'Ajusta la búsqueda o el filtro de activos' : 'Crea el primer producto con «Nuevo producto»'}</p></div>
      : <div className={`overflow-hidden rounded-lg bg-white shadow ${loading ? 'opacity-60' : ''}`}><div className="overflow-x-auto"><table className="w-full">
        <thead className="bg-gray-50"><tr>
          {['Producto', 'En bodega', 'Prestados', 'Total', 'Último movimiento', 'Acciones'].map((h, i) => <th key={h} scope="col" className={`px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${i >= 1 && i <= 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {products.map(product => <tr key={product.id} className={`align-top hover:bg-gray-50 ${!product.active ? 'text-gray-400' : ''}`}>
            <td className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-gray-900">{product.name}</span>
                {!product.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Inactivo</span>}
                {product.active && product.stock === 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Sin existencias</span>}</div>
              {product.description && <div className="text-xs text-gray-500">{product.description}</div>}
              <div className="text-xs text-gray-400">Precio sugerido {formatMoney(toCents(product.price))}</div>
            </td>
            <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums ${product.stock === 0 ? 'text-red-700' : 'text-gray-900'}`}>{product.stock}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-gray-700">{product.loaned}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-gray-700">{product.total}</td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{product.lastMovementAt ? formatDateTimeCO(product.lastMovementAt) : '—'}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap gap-1">
              {action(product, 'PURCHASE', 'Compra', ShoppingCart)}{action(product, 'ENTRY', 'Entrada', PackagePlus)}{data?.permissions.writeOff && action(product, 'WRITE_OFF', 'Baja', PackageMinus)}{action(product, 'COUNT', 'Conteo', ClipboardList)}
              <Link href={`/dashboard/inventory?tab=kardex&product=${product.id}`} title="Ver kardex" className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-primary-600 hover:bg-gray-50"><History size={14} /> Kardex</Link>
            </div></td>
          </tr>)}
        </tbody>
      </table></div></div>}

    {movement && <MovementDialog open onClose={() => setMovement(null)} onSaved={() => void load()} products={data?.products || []} product={movement.product} type={movement.type} allowWriteOff={!!data?.permissions.writeOff} />}

    <Dialog open={creating} onOpenChange={value => { if (!value && !saving) setCreating(false) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo producto</DialogTitle><DialogDescription>Se agrega al catálogo sin existencias; luego registra una compra o entrada.</DialogDescription></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); void createProduct() }} className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Nombre <span className="text-red-500">*</span><input required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={`${inputClass} mt-1`} /></label>
          <label className="block text-sm font-medium text-gray-700">Descripción<textarea rows={2} maxLength={1000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} className={`${inputClass} mt-1`} /></label>
          <label className="block text-sm font-medium text-gray-700">Precio sugerido <span className="text-red-500">*</span><MoneyInput aria-label="Precio sugerido" valueCents={draft.priceCents} onChange={cents => setDraft({ ...draft, priceCents: cents })} className="mt-1 text-sm" placeholder="0" /></label>
          <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.loanable} onChange={e => setDraft({ ...draft, loanable: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><span><span className="font-medium">Equipo de préstamo</span><span className="block text-xs text-gray-500">Aparece en Préstamos y en el reporte de Equipos para salidas a clientes.</span></span></label>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Crear producto'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
