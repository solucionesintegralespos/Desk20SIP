'use client'
import { useSession } from 'next-auth/react'
import CreateTicketForm from './CreateTicketForm'
export default function CreateTicketModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: session } = useSession()
  if (!isOpen || !session) return null
  return <div role="dialog" aria-modal="true" aria-label="Nuevo ticket" className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
    <div className="max-w-3xl mx-auto"><button type="button" onClick={onClose} className="bg-white rounded px-4 py-2 mb-2">Cerrar</button>
      <CreateTicketForm currentUser={{ id: session.user.id, role: session.user.role }} />
    </div>
  </div>
}
