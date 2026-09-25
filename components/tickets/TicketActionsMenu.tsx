'use client'

import { useState, useRef, useEffect } from 'react'
import TechnicianPicker from './TechnicianPicker'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { TicketStatus, TicketPriority } from '@prisma/client'

interface TicketActionsMenuProps {
  ticket: {
    id: string
    status: TicketStatus
    priority: TicketPriority
    assignments?: Array<{ user: { id: string; name: string | null; email: string | null } }>
    assignee: {
      id: string
      name: string | null
    } | null
  }
  agents: Array<{
    id: string
    name: string | null
    email: string | null
  }>
  onClose: () => void
}

export default function TicketActionsMenu({ ticket, agents, onClose }: TicketActionsMenuProps) {
  const router = useRouter()
  const [selected, setSelected] = useState(ticket.assignments?.map(a => a.user.id) || (ticket.assignee ? [ticket.assignee.id] : []))
  const menuRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const updateTicket = async (data: any) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        router.refresh()
        onClose()
      } else {
        const result = await response.json()
        toast.error(result.error || 'No se pudo guardar')
      }
    } catch (error) {
      console.error('Error updating ticket:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      ref={menuRef}
      className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10"
    >
      <div className="py-1">
        <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Estado</div>
        {['OPEN', 'PENDING', 'CLOSED'].map((status) => (
          <button
            key={status}
            onClick={() => updateTicket({ status })}
            disabled={loading}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {status === 'OPEN' && '🔴 Abierto'}
            {status === 'PENDING' && '🟡 Pendiente'}
            {status === 'CLOSED' && '⚫ Cerrado'}
          </button>
        ))}

        <div className="border-t my-1"></div>
        
        <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Prioridad</div>
        {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((priority) => (
          <button
            key={priority}
            onClick={() => updateTicket({ priority })}
            disabled={loading}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {priority === 'LOW' && 'Baja'}
            {priority === 'NORMAL' && 'Normal'}
            {priority === 'HIGH' && 'Alta'}
            {priority === 'URGENT' && '⚠️ Urgente'}
          </button>
        ))}

        <div className="border-t my-1"></div>
        
        <div className="p-3"><TechnicianPicker agents={agents} value={selected} onChange={setSelected} disabled={loading} />
          <button type="button" disabled={loading || !selected.length} onClick={() => updateTicket({ assigneeIds: selected })} className="mt-2 px-3 py-2 bg-primary-600 text-white rounded disabled:opacity-50">Guardar asignación</button>
        </div>
      </div>
    </div>
  )
}
