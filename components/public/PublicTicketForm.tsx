'use client'

import TechnicianPicker from '../tickets/TechnicianPicker'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface PublicTicketFormProps {
  customerId: string
  publicToken: string
  categories: Array<{ id: string; name: string }>
  agents: Array<{ id: string; name: string | null }>
}

export default function PublicTicketForm({ customerId, publicToken, categories, agents }: PublicTicketFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [ticketNumber, setTicketNumber] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: '',
    type: '',
    categoryId: '',
    assigneeIds: agents[0] ? [agents[0].id] : [],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.assigneeIds.length) { toast.error('Selecciona al menos un técnico'); return }
    setLoading(true)

    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          customerId, publicToken,
        }),
      })

      if (response.ok) {
        const ticket = await response.json()
        setTicketNumber(ticket.number)
        setSuccess(true)
        setFormData({
          subject: '',
          description: '',
          priority: '',
    type: '',
    categoryId: '',
    assigneeIds: agents[0] ? [agents[0].id] : [],
        })
      } else {
        const data = await response.json(); toast.error(data.error || 'Error al crear el ticket')
      }
    } catch (error) {
      console.error('Error creating ticket:', error)
      toast.error('Error al crear el ticket')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          ¡Ticket Creado!
        </h2>
        <p className="text-gray-600 mb-4">
          Tu ticket #{ticketNumber} ha sido creado exitosamente.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Nuestro equipo de soporte lo revisará pronto y te contactará por email.
        </p>
        <button
          onClick={() => setSuccess(false)}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Crear Otro Ticket
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Asunto <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Describe brevemente tu problema"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descripción <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Proporciona todos los detalles posibles sobre tu problema..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Prioridad <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Seleccionar prioridad...</option>
            <option value="LOW">Baja</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </div>

        <label className="block text-sm font-medium">Tipo *<select required value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="block w-full border rounded-lg p-2 mt-2"><option value="">Seleccionar tipo...</option><option value="INCIDENT">Incidente</option><option value="CHANGE_REQUEST">Solicitud de cambio</option><option value="PROJECT">Proyecto</option></select></label>
        <label className="block text-sm font-medium">Categoría *<select required value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })} className="block w-full border rounded-lg p-2 mt-2"><option value="">Seleccionar categoría...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <TechnicianPicker agents={agents} value={formData.assigneeIds} onChange={assigneeIds => setFormData({ ...formData, assigneeIds })} disabled={loading} />
        <div className="flex justify-end pt-4 border-t">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creando...' : 'Crear Ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}
