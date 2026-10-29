'use client'

import ViewToggle, { DirectoryView } from '../ViewToggle'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Phone, MapPin, Building, Ticket, Edit2, Trash2, Link as LinkIcon, Check, FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface Customer {
  id: string
  name: string | null
  email: string | null
  avatar: string | null
  phone: string | null
  location: string | null
  address: string | null
  organizationId: string | null
  createdAt: Date
  organization: {
    id: string
    name: string
  } | null
  _count: {
    createdTickets: number
  }
  createdTickets: Array<{
    status: string
  }>
}

interface CustomersTableProps {
  customers: Customer[]
  hasCustomers: boolean
  query: string
}

export default function CustomersTable({ customers, hasCustomers, query }: CustomersTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [view, setView] = useState<DirectoryView>('cards')
  const [searchTerm, setSearchTerm] = useState(query)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [loadingToken, setLoadingToken] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  // The page already holds the matching customers; the search lives in the URL.
  const filteredCustomers = customers

  // Ordenar alfabéticamente por nombre
  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    const nameA = (a.name || a.email || '').toLowerCase()
    const nameB = (b.name || b.email || '').toLowerCase()
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' })
  })

  useEffect(() => { setSearchTerm(query) }, [query])
  useEffect(() => {
    if (searchTerm.trim() === query) return
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (searchTerm.trim()) params.set('q', searchTerm.trim()); else params.delete('q')
      params.delete('page')
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm, query, pathname, router, searchParams])

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cliente?')) return

    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        router.refresh()
      }
    } catch (error) {
      console.error('Error deleting customer:', error)
    }
  }

  const handleGenerateLink = async (customerId: string) => {
    setLoadingToken(customerId)
    try {
      // Try to get existing token first
      let response = await fetch(`/api/customers/${customerId}/token`)
      let data = await response.json()

      // If no token exists, generate one
      if (!data.token) {
        response = await fetch(`/api/customers/${customerId}/token`, {
          method: 'POST',
        })
        data = await response.json()
      }

      if (data.url) {
        await navigator.clipboard.writeText(data.url)
        setCopiedId(customerId)
        setTimeout(() => setCopiedId(null), 2000)
      }
    } catch (error) {
      console.error('Error generating link:', error)
      toast.error('Error al generar el enlace')
    } finally {
      setLoadingToken(null)
    }
  }

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      let dataToExport: any[] = customers
      try {
        const res = await fetch('/api/customers')
        if (res.ok) {
          const all = await res.json()
          if (Array.isArray(all) && all.length > 0) {
            dataToExport = all
          }
        }
      } catch {
        // Fallback to currently loaded customers
      }

      const term = searchTerm.trim().toLowerCase()
      const listToExport = term
        ? dataToExport.filter((c: any) =>
            (c.name && c.name.toLowerCase().includes(term)) ||
            (c.email && c.email.toLowerCase().includes(term)) ||
            (c.organization?.name && c.organization.name.toLowerCase().includes(term)) ||
            (c.phone && c.phone.toLowerCase().includes(term)) ||
            (c.location && c.location.toLowerCase().includes(term))
          )
        : dataToExport

      listToExport.sort((a: any, b: any) => {
        const nameA = (a.name || a.email || '').toLowerCase()
        const nameB = (b.name || b.email || '').toLowerCase()
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' })
      })

      const cell = (val: unknown) => {
        if (val == null) return '""'
        const str = String(val).trim()
        const safe = /^[\s\uFEFF]*[=+@-]/.test(str) ? `'${str}` : str
        return `"${safe.replace(/"/g, '""')}"`
      }

      const headers = [
        'Nombre Completo',
        'Correo Electrónico',
        'Teléfono',
        'Ubicación / Ciudad',
        'Dirección',
        'Organización',
        'Tickets Totales',
        'Tickets Abiertos',
        'Fecha de Registro'
      ]

      const rows = listToExport.map((c: any) => [
        c.name || 'Sin nombre',
        c.email || '',
        c.phone || '',
        c.location || '',
        c.address || '',
        c.organization?.name || '',
        c._count?.createdTickets ?? 0,
        Array.isArray(c.createdTickets) ? c.createdTickets.filter((t: any) => t.status === 'OPEN').length : 0,
        c.createdAt ? format(new Date(c.createdAt), 'dd/MM/yyyy HH:mm', { locale: es }) : ''
      ])

      const csvContent =
        '\uFEFFsep=;\r\n' +
        [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n') +
        '\r\n'

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `clientes_${format(new Date(), 'yyyy-MM-dd')}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Listado de clientes exportado con éxito')
    } catch (err) {
      console.error('Error al exportar clientes:', err)
      toast.error('Error al exportar clientes a Excel')
    } finally {
      setExporting(false)
    }
  }

  if (!hasCustomers) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <p className="text-gray-500 text-lg">No hay clientes registrados</p>
        <p className="text-gray-400 mt-2">Crea tu primer cliente para comenzar</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || !sortedCustomers.length}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition disabled:opacity-50"
            title="Exportar listado a Excel"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            )}
            <span>{exporting ? 'Exportando...' : 'Exportar a Excel'}</span>
          </button>
        </div>
        <div className="w-full sm:flex-1 sm:max-w-md">
          <input
            type="text"
            placeholder="Buscar clientes por nombre, email u organización..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {!sortedCustomers.length && <p className="p-6 text-gray-500">No se encontraron clientes</p>}
      {view === 'list' ? <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b"><th className="p-4">Cliente</th><th>Correo</th><th>Organización</th><th>Tickets</th><th>Abiertos</th><th>Acciones</th></tr></thead>
      <tbody>{sortedCustomers.map(customer => <tr key={customer.id} className="border-b"><td className="p-4">{customer.name || 'Sin nombre'}</td><td>{customer.email || '—'}</td><td>{customer.organization?.name || '—'}</td><td>{customer._count.createdTickets}</td><td>{customer.createdTickets.filter(t => t.status === 'OPEN').length}</td><td className="flex gap-1 py-3">
      <button aria-label="Copiar enlace" disabled={loadingToken === customer.id} onClick={() => handleGenerateLink(customer.id)} className="p-2">{copiedId === customer.id ? <Check size={16} /> : <LinkIcon size={16} />}</button>
      <Link aria-label="Editar cliente" href={`/dashboard/customers/${customer.id}`} className="p-2"><Edit2 size={16} /></Link><button aria-label="Eliminar cliente" onClick={() => handleDelete(customer.id)} className="p-2"><Trash2 size={16} /></button>
      </td></tr>)}</tbody></table></div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
        {sortedCustomers.map((customer) => {
          const openTickets = customer.createdTickets.filter(t => t.status === 'OPEN').length

          return (
            <div key={customer.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-green-600 font-medium text-lg">
                      {customer.name?.[0] || (customer.email?.[0]?.toUpperCase() || "?")}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {customer.name || 'Sin nombre'}
                    </h3>
                    {openTickets > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        {openTickets} ticket{openTickets > 1 ? 's' : ''} abierto{openTickets > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex space-x-1">
                  <button
                    onClick={() => handleGenerateLink(customer.id)}
                    disabled={loadingToken === customer.id}
                    className="p-2 text-gray-400 hover:text-green-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                    title="Copiar enlace para crear tickets"
                  >
                    {copiedId === customer.id ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <LinkIcon className="h-4 w-4" />
                    )}
                  </button>
                  <Link
                    href={`/dashboard/customers/${customer.id}`}
                    aria-label={`Editar cliente ${customer.name || customer.email || ''}`}
                    title="Editar cliente"
                    className="inline-flex items-center gap-1 p-2 text-primary-600 rounded-lg hover:bg-gray-100"
                  >
                    <Edit2 className="h-4 w-4" />
                    <span className="text-xs font-medium">Editar</span>
                  </Link>
                  <button
                    onClick={() => handleDelete(customer.id)}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <Mail className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
                
                {customer.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                
                {customer.location && (
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{customer.location}</span>
                  </div>
                )}

                {customer.organization && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Building className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{customer.organization.name}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-xs text-gray-500">
                    <Ticket className="h-3 w-3 mr-1" />
                    {customer._count.createdTickets} tickets
                  </div>
                  <div className="text-xs text-gray-500">
                    {format(new Date(customer.createdAt), 'PP', { locale: es })}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>}
    </div>
  )
}
