'use client'
import { assignedSummary } from '@/lib/assigned-names'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { TicketStatus, TicketPriority, TicketType } from '@prisma/client'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Ticket {
  id: string
  number: number
  subject: string
  status: TicketStatus
  priority: TicketPriority
  type: TicketType | null
  createdAt: Date
  updatedAt: Date
  customer: {
    id: string
    name: string | null
    email: string | null
    avatar: string | null
  }
  category: {
    id: string
    name: string
  } | null
  assignments?: Array<{ user: { id: string; name: string | null; email: string | null } }>
  assignee: {
    id: string
    name: string | null
    email: string | null
  } | null
  _count: {
    messages: number
  }
}

interface TicketsTableProps {
  tickets: Ticket[]
  agents: Array<{
    id: string
    name: string | null
    email: string | null
  }>
  currentUserId: string
}

const statusColors = {
  OPEN: 'bg-red-100 text-red-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  SOLVED: 'bg-gray-100 text-gray-800',
  CLOSED: 'bg-gray-100 text-gray-800',
}

const statusLabels = {
  OPEN: 'Abierto',
  PENDING: 'Pendiente',
  SOLVED: 'Cerrado',
  CLOSED: 'Cerrado',
}

const priorityColors = {
  LOW: 'text-gray-600',
  NORMAL: 'text-blue-600',
  HIGH: 'text-orange-600',
  URGENT: 'text-red-600',
}

const priorityLabels = {
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

const typeLabels = {
  INCIDENT: 'Incidente',
  CHANGE_REQUEST: 'Solicitud de cambio',
  PROJECT: 'Proyecto',
}

export default function TicketsTable({ tickets, agents, currentUserId }: TicketsTableProps) {
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  useEffect(() => {
    setCurrentPage(1)
  }, [tickets])

  const totalPages = Math.ceil(tickets.length / itemsPerPage)
  const currentTickets = tickets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <p className="text-gray-500 text-lg">No se encontraron tickets</p>
        <p className="text-gray-400 mt-2">Intenta ajustar los filtros o crea un nuevo ticket</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ticket
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Categoría
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Prioridad
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Asignado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actualizado
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentTickets.map((ticket) => (
              <tr 
                key={ticket.id} 
                onClick={() => router.push(`/dashboard/tickets/${ticket.id}`)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-primary-600 font-medium">
                    #{ticket.number}
                  </div>
                  <div className="text-sm text-gray-900 mt-1">{ticket.subject}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {ticket._count.messages} mensajes
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-primary-600 font-medium">
                          {ticket.customer.name?.[0] || (ticket.customer.email?.[0]?.toUpperCase() || "?")}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {ticket.customer.name || 'Sin nombre'}
                      </div>
                      <div className="text-sm text-gray-500">{ticket.customer.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {ticket.type ? (
                    <span className="text-sm text-gray-900">
                      {typeLabels[ticket.type]}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {ticket.category ? (
                    <span className="text-sm text-gray-900">
                      {ticket.category.name}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[ticket.status]}`}>
                    {statusLabels[ticket.status]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-sm font-medium ${priorityColors[ticket.priority]}`}>
                    {priorityLabels[ticket.priority]}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {(() => { const assigned = assignedSummary(ticket); return <span className="flex max-w-[16rem] items-center gap-1.5" title={assigned.all}>
                    <span className="truncate">{assigned.text}</span>
                    {assigned.more > 0 && <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700" aria-label={`y ${assigned.more} más: ${assigned.all}`}>+{assigned.more}</span>}
                  </span> })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {format(new Date(ticket.updatedAt), 'PPp', { locale: es })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Paginación y Contador */}
      <div className="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Mostrando del <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> al{' '}
              <span className="font-medium">
                {Math.min(currentPage * itemsPerPage, tickets.length)}
              </span>{' '}
              de <span className="font-medium">{tickets.length}</span> tickets
            </p>
          </div>
          <div>
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sr-only">Anterior</span>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              
              <div className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                Página {currentPage} de {totalPages}
              </div>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sr-only">Siguiente</span>
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </nav>
          </div>
        </div>
        
        {/* Vista móvil */}
        <div className="flex items-center justify-between w-full sm:hidden">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-700">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  )
}
