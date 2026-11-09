'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { api } from '@/components/accounting/api'
import { Button } from '@/components/support/ui'
import { formatShortDateCO, formatDateTimeCO } from '@/lib/accounting/format'
import { searchText } from '@/components/support/SearchFilter'

type OpenLoan = { id: string; numberLabel: string; quantity: number; outAt: string; days: number; ageLabel: string; customer: { id: string; name: string }; technician: { id: string; name: string } }
type ProductRow = { id: string; name: string; active: boolean; stock: number; loanedUnits: number; openLoans: OpenLoan[] }
type Report = { products: ProductRow[]; totals: { products: number; available: number; loaned: number; oldestDays: number }; generatedAt: string }

const ageClass = (days: number) => days >= 90 ? 'bg-red-50 text-red-700' : days >= 30 ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700'

export default function LoanReport() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyLoaned, setOnlyLoaned] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setReport(await api<Report>('/api/inventory/loans/report')) }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => {
    if (!report) return []
    const term = searchText(search)
    return report.products.filter(row => (!onlyLoaned || row.loanedUnits > 0) && (!term || searchText(`${row.name} ${row.openLoans.map(loan => `${loan.numberLabel} ${loan.customer.name} ${loan.technician.name}`).join(' ')}`).includes(term)))
  }, [report, onlyLoaned, search])

  const cards = report ? [
    ['Equipos', String(report.totals.products), ''],
    ['Disponibles en bodega', String(report.totals.available), 'unidades'],
    ['Prestados', String(report.totals.loaned), 'unidades'],
    ['Préstamo más antiguo', report.totals.loaned ? `${report.totals.oldestDays} día${report.totals.oldestDays === 1 ? '' : 's'}` : '—', ''],
  ] : []

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-gray-900">Equipos disponibles y prestados</h2><p className="text-sm text-gray-600">Existencias en bodega frente a unidades en préstamo y desde cuándo están fuera.</p></div>
      <Button variant="outline" disabled={loading} onClick={() => void load()} aria-label="Actualizar reporte"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar</Button>
    </div>

    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {(report ? cards : [['Equipos', '—', ''], ['Disponibles en bodega', '—', ''], ['Prestados', '—', ''], ['Préstamo más antiguo', '—', '']]).map(([label, value, unit]) => <div key={label} className="rounded-lg bg-white p-4 shadow">
        <p className="text-sm text-gray-500">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${label === 'Prestados' ? 'text-amber-700' : 'text-gray-900'}`}>{value} {unit && <span className="text-sm font-normal text-gray-500">{unit}</span>}</p>
      </div>)}
    </div>

    <div className="mb-4 flex flex-col gap-3 rounded-lg bg-white p-4 shadow md:flex-row md:items-center">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar equipo, cliente, técnico o número de préstamo…" aria-label="Buscar" className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={onlyLoaned} onChange={e => setOnlyLoaned(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" /> Solo con préstamos</label>
    </div>

    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
    {loading && !report ? <div className="rounded-lg bg-white p-12 text-center text-gray-500 shadow">Cargando reporte…</div>
      : rows.length === 0 ? <div className="rounded-lg bg-white p-12 text-center shadow"><p className="text-lg text-gray-500">{onlyLoaned ? 'No hay equipos en préstamo' : 'No hay equipos en el catálogo'}</p></div>
      : <div className={`overflow-hidden rounded-lg bg-white shadow ${loading ? 'opacity-60' : ''}`}>
        <div className="overflow-x-auto"><table className="w-full">
          <thead className="bg-gray-50"><tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Equipo</th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Disponibles</th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Prestados</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Detalle de préstamos</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {rows.map(row => <tr key={row.id} className="align-top hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}{!row.active && <span className="ml-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Inactivo</span>}</td>
              <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums ${row.stock === 0 ? 'text-red-600' : 'text-gray-900'}`}>{row.stock}</td>
              <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums ${row.loanedUnits ? 'text-amber-700' : 'text-gray-400'}`}>{row.loanedUnits}</td>
              <td className="px-4 py-3 text-sm">{row.openLoans.length === 0 ? <span className="text-gray-400">Sin préstamos en curso</span> : <ul className="space-y-1.5">
                {row.openLoans.map(loan => <li key={loan.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-primary-600">{loan.numberLabel}</span>
                  <span className="text-gray-900">{loan.customer.name}</span>
                  <span className="text-gray-500">· {loan.technician.name} · {loan.quantity} ud.</span>
                  <span className="text-gray-500" title={formatDateTimeCO(loan.outAt)}>· desde {formatShortDateCO(loan.outAt)}</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ageClass(loan.days)}`}>hace {loan.ageLabel}</span>
                </li>)}
              </ul>}</td>
            </tr>)}
          </tbody>
        </table></div>
        {report && <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">Generado el {formatDateTimeCO(report.generatedAt)}. Más de 30 días en ámbar, más de 90 en rojo.</p>}
      </div>}
  </>
}
