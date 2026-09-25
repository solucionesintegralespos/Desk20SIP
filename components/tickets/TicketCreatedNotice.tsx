'use client'

import { useRef, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface CreatedTicket {
  number: number
  subject: string
  assignments: Array<{ user: { name: string | null; email: string | null } }>
}

export function showTicketCreatedNotice(ticket: CreatedTicket) {
  toast.custom(t => <TicketCreatedNotice ticket={ticket} onClose={() => toast.remove(t.id)} />, {
    id: 'ticket-created-whatsapp',
    duration: Infinity,
  })
}

function TicketCreatedNotice({ ticket, onClose }: { ticket: CreatedTicket; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const names = ticket.assignments.map(({ user }) => user.name || user.email || 'Agente asignado')
  const message = [
    'Confirmamos que su requerimiento se encuentra activo en nuestra mesa de ayuda.',
    '',
    `📋 Ticket de Atención: #${ticket.number}`,
    `📝 Asunto: ${ticket.subject}`,
    '',
    `👨‍💻 ${names.length === 1 ? 'Ingeniero a cargo' : 'Ingenieros a cargo'}: ${names.join(', ') || 'Pendiente de asignación'}`,
    '',
    'Su solicitud se encuentra en revisión. De no recibir respuesta, se dará por solucionado y se cerrará el ticket. ⚡',
  ].join('\n')

  async function copyMessage() {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch {
      // También permite copiar desde conexiones HTTP de la red local.
      messageRef.current?.focus()
      messageRef.current?.select()
      try {
        if (!document.execCommand('copy')) throw new Error('No se pudo copiar')
        setCopied(true)
      } catch {
        setCopyError(true)
      }
    }
  }

  return <section role="status" aria-label="Ticket creado correctamente" className="pointer-events-auto w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-green-200 bg-white p-4 shadow-lg">
    <div className="flex items-start justify-between gap-3">
      <div><p className="font-semibold text-green-800">Ticket #{ticket.number} creado correctamente</p><p className="mt-1 text-sm text-gray-600">Mensaje listo para WhatsApp</p></div>
      <button type="button" aria-label="Cerrar notificación" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
    </div>
    <textarea ref={messageRef} readOnly aria-label="Mensaje para WhatsApp" value={message} className="mt-3 h-40 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700" />
    {copyError && <p role="alert" className="mt-2 text-sm text-red-700">No se pudo copiar automáticamente. El texto está seleccionado: presiona Ctrl+C o usa la opción Copiar de tu dispositivo.</p>}
    <button type="button" onClick={copyMessage} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
      {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copiado · Copiar de nuevo' : 'Copiar para WhatsApp'}
    </button>
  </section>
}
