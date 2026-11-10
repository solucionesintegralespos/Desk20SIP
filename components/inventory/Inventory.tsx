'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import StockTable from './StockTable'
import Kardex from './Kardex'
import Loans from './Loans'
import LoanReport from './LoanReport'
import BulkCount from './BulkCount'

const tabs = [
  { id: 'stock', label: 'Existencias' },
  { id: 'kardex', label: 'Kardex' },
  { id: 'counts', label: 'Conteos' },
  { id: 'loans', label: 'Préstamos' },
  { id: 'report', label: 'Equipos' },
] as const
type Tab = typeof tabs[number]['id']

export default function Inventory() {
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams()
  const current = searchParams.get('tab')
  const tab: Tab = tabs.some(t => t.id === current) ? current as Tab : 'stock'
  // The tab is in the URL so links (e.g. "Kardex" from a product row) and refreshes keep it.
  const select = (id: Tab) => router.push(id === 'stock' ? pathname : `${pathname}?tab=${id}`)

  return <>
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-gray-900">Inventario</h1>
      <p className="mt-1 text-gray-600">Existencias del catálogo, movimientos (kardex) y préstamos de equipos a clientes</p>
    </div>
    <div role="tablist" aria-label="Secciones del inventario" className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map(t => <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => select(t.id)}
        className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${tab === t.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>)}
    </div>
    <div role="tabpanel">
      {tab === 'stock' && <StockTable />}
      {tab === 'kardex' && <Kardex />}
      {tab === 'counts' && <BulkCount />}
      {tab === 'loans' && <Loans />}
      {tab === 'report' && <LoanReport />}
    </div>
  </>
}
