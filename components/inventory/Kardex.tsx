'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { History, Loader2 } from 'lucide-react'
import { api } from '@/components/accounting/api'
import { SearchSelect } from '@/components/ui/SearchSelect'
import Pagination from '@/components/tickets/Pagination'
import { formatDateTimeCO, formatMoney, toCents } from '@/lib/accounting/format'
import { inputClass, type MovementsResponse, type MovementType, type StockResponse } from './types'

const typeFilters: Array<[MovementType | '', string]> = [['', 'Todos los movimientos'], ['PURCHASE', 'Compra'], ['ENTRY', 'Entrada'], ['WRITE_OFF', 'Baja'], ['COUNT', 'Conteo'], ['LOAN_OUT', 'Salida en préstamo'], ['LOAN_IN', 'Devolución de préstamo']]
const pill = (type: MovementType) => type === 'PURCHASE' || type === 'ENTRY' || type === 'LOAN_IN' ? 'bg-green-50 text-green-800' : type === 'WRITE_OFF' || type === 'LOAN_OUT' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'

export default function Kardex() {
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams()
  const product = searchParams.get('product') || '', type = searchParams.get('type') || '', from = searchParams.get('from') || '', to = searchParams.get('to') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const [products, setProducts] = useState<StockResponse['products']>([])
  const [data, setData] = useState<MovementsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { api<StockResponse>('/api/inventory/stock').then(result => setProducts(result.products)).catch(() => setProducts([])) }, [])
  const query = useMemo(() => { const p = new URLSearchParams(); if (product) p.set('product', product); if (type) p.set('type', type); if (from) p.set('from', from); if (to) p.set('to', to); if (page > 1) p.set('page', String(page)); return p.toString() }, [product, type, from, to, page])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await api<MovementsResponse>(`/api/inventory/movements${query ? `?${query}` : ''}`)) }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [query])
  useEffect(() => { void load() }, [load])

  // Filters live in the URL (tab included) so the kardex link from a product row works.
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'kardex'); params.delete('page')
    if (value) params.set(key, value); else params.delete(key)
    router.push(`${pathname}?${params.toString()}`)
  }
  const hasFilters = !!(product || type || from || to)
  const productOptions = useMemo(() => products.map(p => ({ id: p.id, label: p.name, description: `${p.stock} en bodega` })), [products])
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1

  return <>
    <div className="mb-4 rounded-lg bg-white p-4 shadow">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="w-full md:w-72"><span className="mb-1 block text-sm font-medium text-gray-700">Producto</span>
          <SearchSelect aria-label="Producto" placeholder="Todos los productos…" emptyOption="Todos los productos" value={product} onChange={id => setFilter('product', id)} options={productOptions} /></div>
        <label className="text-sm font-medium text-gray-700">Movimiento
          <select value={type} onChange={e => setFilter('type', e.target.value)} className={`${inputClass} mt-1 md:w-auto`}>{typeFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium text-gray-700">Desde<input type="date" value={from} max={to || undefined} onChange={e => setFilter('from', e.target.value)} className={`${inputClass} mt-1`} /></label>
        <label className="text-sm font-medium text-gray-700">Hasta<input type="date" value={to} min={from || undefined} onChange={e => setFilter('to', e.target.value)} className={`${inputClass} mt-1`} /></label>
        {hasFilters && <button type="button" onClick={() => router.push(`${pathname}?tab=kardex`)} className="px-3 py-2 text-sm font-medium text-primary-600 hover:text-primary-700">Limpiar filtros</button>}
      </div>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
    {loading && !data ? <div className="rounded-lg bg-white p-12 text-center text-gray-500"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Cargando kardex…</div>
      : !data || data.movements.length === 0 ? <div className="rounded-lg bg-white p-12 text-center shadow"><History className="mx-auto mb-3 h-10 w-10 text-gray-300" /><p className="text-lg text-gray-500">Sin movimientos{hasFilters ? ' con estos filtros' : ''}</p><p className="mt-2 text-gray-400">Las compras, entradas, bajas, conteos y préstamos aparecen aquí con su saldo.</p></div>
      : <div className={`overflow-hidden rounded-lg bg-white shadow ${loading ? 'opacity-60' : ''}`}><div className="overflow-x-auto"><table className="w-full">
        <thead className="bg-gray-50"><tr>{['Fecha', 'Producto', 'Movimiento', 'Cantidad', 'Saldo', 'Costo unit.', 'Referencia / notas', 'Usuario'].map((h, i) => <th key={h} scope="col" className={`px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-200">
          {data.movements.map(m => <tr key={m.id} className="align-top hover:bg-gray-50">
            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{formatDateTimeCO(m.createdAt)}</td>
            <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.productName}</td>
            <td className="whitespace-nowrap px-4 py-3 text-sm"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pill(m.type)}`}>{m.typeLabel}</span>{m.loanNumber != null && <span className="ml-1 text-xs text-gray-500">Préstamo #{m.loanNumber}</span>}{m.type === 'COUNT' && m.countedQuantity != null && <div className="text-xs text-gray-500">Encontradas: {m.countedQuantity}</div>}</td>
            <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums ${m.quantity < 0 ? 'text-red-700' : m.quantity > 0 ? 'text-green-700' : 'text-gray-500'}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-gray-900">{m.balanceAfter}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-gray-700">{m.unitCost != null ? formatMoney(toCents(m.unitCost)) : '—'}</td>
            <td className="max-w-xs px-4 py-3 text-sm text-gray-700">{m.reference && <div className="font-medium">{m.reference}</div>}{m.notes && <div className="text-xs text-gray-500">{m.notes}</div>}{!m.reference && !m.notes && '—'}</td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{m.createdBy?.name || '—'}</td>
          </tr>)}
        </tbody>
      </table></div></div>}
    {data && <Pagination currentPage={page} totalPages={totalPages} totalCount={data.total} perPage={data.perPage} itemLabel="movimientos" />}
  </>
}
