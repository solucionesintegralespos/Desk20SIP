'use client'

import TechnicianPicker from './TechnicianPicker'
import { useSession } from 'next-auth/react'
import { toast } from 'react-hot-toast'
import { useState, useEffect } from 'react'
import { TicketStatus, TicketPriority } from '@prisma/client'
import { ArrowLeft, User } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTicketsListHref } from '@/lib/tickets-list-query'

interface TicketHeaderProps {
  ticket: {
    id: string
    number: number
    subject: string
    status: TicketStatus
    priority: TicketPriority
    assignments?: Array<{ user: { id: string; name: string | null; email: string | null } }>
    assignee: {
      id: string
      name: string | null
      email: string | null
    } | null
  }
}

const statusLabels = {
  OPEN: 'Abierto',
  PENDING: 'Pendiente',
  SOLVED: 'Cerrado',
  CLOSED: 'Cerrado',
}

const priorityLabels = {
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

export default function TicketHeader({ ticket }: TicketHeaderProps) {
  const router = useRouter()
  const ticketsListHref = useTicketsListHref()
  const { data: session } = useSession()
  const [selected, setSelected] = useState<string[]>(ticket.assignments?.map(a => a.user.id) || (ticket.assignee ? [ticket.assignee.id] : []))
  useEffect(() => { setSelected(ticket.assignments?.map(a => a.user.id) || (ticket.assignee ? [ticket.assignee.id] : [])) }, [ticket])
  const [agents, setAgents] = useState<Array<{ id: string; name: string | null; email: string | null }>>([])
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    // Fetch agents for assignment
    fetch('/api/tickets/options')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.agents)) {
          setAgents(data.agents)
        } else {
          console.error('Expected array of agents, got:', data)
          setAgents([])
        }
      })
      .catch(err => {
        console.error('Error fetching agents:', err)
        setAgents([])
      })
  }, [])

  const handleStatusChange = async (newStatus: TicketStatus) => {
    setUpdating(true)
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) { router.refresh() } else { const data = await response.json(); toast.error(data.error || 'No se pudo guardar') }
    } catch (error) {
      console.error('Error updating status:', error)
    } finally {
      setUpdating(false)
    }
  }

  const handleAssigneeChange = async () => {
    setUpdating(true)
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeIds: selected })
      })

      if (response.ok) { router.refresh() } else { const data = await response.json(); toast.error(data.error || 'No se pudo guardar') }
    } catch (error) {
      console.error('Error updating assignee:', error)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="bg-white border-b px-6 py-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center space-x-4">
          <Link 
            href={ticketsListHref}
            aria-label="Volver a tickets"
            className="text-gray-400 hover:text-gray-600 mt-1 md:mt-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <h1 className="text-2xl font-bold text-gray-900 break-words">
                Ticket #{ticket.number}
              </h1>
              
              {/* Status Dropdown */}
              <select
                value={ticket.status === 'SOLVED' ? 'CLOSED' : ticket.status}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                disabled={updating}
                className="px-3 py-1 text-sm font-medium rounded-full border border-gray-300 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              >
                <option value="OPEN">{statusLabels.OPEN}</option>
                <option value="PENDING">{statusLabels.PENDING}</option>
                <option value="CLOSED">{statusLabels.CLOSED}</option>
              </select>

              <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 whitespace-nowrap">
                Prioridad: {priorityLabels[ticket.priority]}
              </span>
            </div>
            <p className="text-gray-600 mt-2 break-words">{ticket.subject}</p>
          </div>
        </div>
        
        {session?.user.role !== 'CUSTOMER' && (
          <div className="w-full md:w-72">
            <TechnicianPicker
              agents={agents}
              value={selected}
              onChange={setSelected}
              disabled={updating || session?.user?.role !== 'ADMIN'}
            />
            {session?.user?.role === 'ADMIN' ? (
              <button
                type="button"
                disabled={updating || !selected.length}
                onClick={handleAssigneeChange}
                className="mt-2 px-3 py-2 rounded bg-primary-600 text-white text-sm disabled:opacity-50"
              >
                Guardar asignación
              </button>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Solo los administradores pueden cambiar los técnicos asignados.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
