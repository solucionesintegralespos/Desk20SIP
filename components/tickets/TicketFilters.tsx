'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { rememberTicketsQuery } from '@/lib/tickets-list-query'
import { Filter, Search } from 'lucide-react'
import { SearchSelect } from '@/components/ui/SearchSelect'

interface TicketFiltersProps {
  currentStatus?: string
  currentPriority?: string
  currentAssignee?: string
  currentSearch?: string
  currentCategory?: string
  currentCustomer?: string
  currentFrom?: string
  currentTo?: string
  dateFiltered?: boolean
  categories: Array<{ id: string; name: string }>
  /** Empty for customers, who only see their own tickets. */
  customers?: Array<{ id: string; name: string | null; email: string | null }>
  agents: Array<{
    id: string
    name: string | null
    email: string | null
  }>
}

export default function TicketFilters({
  currentStatus,
  currentPriority,
  currentAssignee,
  currentSearch,
  currentCategory,
  currentCustomer,
  currentFrom,
  currentTo,
  dateFiltered,
  categories,
  customers = [],
  agents,
}: TicketFiltersProps) {
  const [searchTerm, setSearchTerm] = useState(currentSearch || '')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  // The URL is the source of truth: remember it for links back to the list and
  // keep the search box in step with back/forward navigation.
  useEffect(() => { rememberTicketsQuery(query) }, [query])
  useEffect(() => { setSearchTerm(currentSearch || '') }, [currentSearch])

  // Every change starts from the current URL and returns to the first page.
  const navigate = (change: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (searchTerm) params.set('search', searchTerm); else params.delete('search')
    change(params)
    const next = params.toString()
    router.push(`${pathname}${next ? `?${next}` : ''}`)
  }

  const updateFilter = (key: string, value: string) => navigate(params => {
    if (value) params.set(key, value); else params.delete(key)
  })

  // Inclusive creation-date range; clearing both dates shows every date.
  const updateRange = (from: string, to: string) => navigate(params => {
    params.delete('date'); params.delete('range'); params.delete('from'); params.delete('to')
    if (from && to && to < from) to = from
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (!from && !to) params.set('range', 'all')
  })
  const allDates = searchParams.get('range') === 'all'

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', searchTerm)
  }

  const clearFilters = () => {
    setSearchTerm('')
    router.push(searchParams.get('mine') === '1' ? `${pathname}?mine=1` : pathname)
  }

  const hasFilters = currentStatus || currentPriority || currentAssignee || currentSearch || currentCategory || currentCustomer || dateFiltered

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por título del ticket..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </form>
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-4">
        <div className="hidden md:flex items-center space-x-2 text-gray-700">
          <Filter className="h-5 w-5" />
          <span className="font-medium">Filtros:</span>
        </div>

        <select
          value={currentStatus || ''}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todos los estados</option>
          <option value="OPEN">Abierto</option>
          <option value="PENDING">Pendiente</option>
          <option value="CLOSED">Cerrado</option>
        </select>

        <select
          value={currentPriority || ''}
          onChange={(e) => updateFilter('priority', e.target.value)}
          className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todas las prioridades</option>
          <option value="LOW">Baja</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">Alta</option>
          <option value="URGENT">Urgente</option>
        </select>

        <select
          value={currentAssignee || ''}
          onChange={(e) => updateFilter('assignee', e.target.value)}
          className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todos los agentes</option>
          <option value="unassigned">Sin asignar</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name || agent.email}
            </option>
          ))}
        </select>

        <select
          aria-label="Categoría"
          value={currentCategory || ''}
          onChange={(e) => updateFilter('category', e.target.value)}
          className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todas las categorías</option>
          <option value="uncategorized">Sin categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>

        {customers.length > 0 && <SearchSelect
          aria-label="Cliente"
          className="w-full md:w-64"
          placeholder="Buscar cliente…"
          emptyOption="Todos los clientes"
          value={currentCustomer || ''}
          onChange={customer => updateFilter('customer', customer)}
          options={customers.map(customer => ({ id: customer.id, label: customer.name || customer.email || 'Sin nombre', description: customer.name ? customer.email || undefined : undefined }))}
        />}

        <fieldset className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 text-sm text-gray-700">
          <legend className="float-left md:mr-1">Fecha de creación:</legend>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Desde"
              title="Desde"
              value={currentFrom || ''}
              max={currentTo || undefined}
              onChange={(e) => updateRange(e.target.value, currentTo || '')}
              className="min-w-0 flex-1 md:flex-none px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <span aria-hidden="true">a</span>
            <input
              type="date"
              aria-label="Hasta"
              title="Hasta"
              value={currentTo || ''}
              min={currentFrom || undefined}
              onChange={(e) => updateRange(currentFrom || '', e.target.value)}
              className="min-w-0 flex-1 md:flex-none px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => navigate(params => { params.delete('date'); params.delete('range'); params.delete('from'); params.delete('to') })}
              className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">Hoy</button>
            <button type="button" aria-pressed={allDates} onClick={() => updateRange('', '')}
              className={`px-3 py-2 rounded-lg border ${allDates ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 hover:bg-gray-50'}`}>Todas</button>
          </div>
        </fieldset>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="w-full md:w-auto px-3 py-2 text-sm text-primary-600 hover:text-primary-700 font-medium md:text-left"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
