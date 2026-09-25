'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageType, UserRole } from '@prisma/client'
import { Paperclip, Download, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface Message {
  id: string
  content: string
  type: MessageType
  isInternal: boolean
  createdAt: Date
  attachments: string[]
  author: {
    id: string
    name: string | null
    email: string | null
    avatar: string | null
    role: UserRole
  }
}

interface MessageListProps {
  ticket: {
    id: string
    description: string | null
    createdAt: Date
    customer: {
      id: string
      name: string | null
      email: string | null
      avatar: string | null
    }
    attachments?: string[]
  }
  messages: Message[]
  currentUserId: string
}

import { useState, useEffect } from 'react'

export default function MessageList({ ticket, messages, currentUserId }: MessageListProps) {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('¿Estás seguro de eliminar este mensaje?')) return
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        toast.success('Mensaje eliminado')
        router.refresh()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error al eliminar el mensaje')
      }
    } catch (error) {
      toast.error('Error al eliminar el mensaje')
    }
  }

  return (
    <div className="space-y-6">
      {/* Descripción inicial del ticket */}
      {ticket.description && (
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-primary-500">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-primary-600 font-medium">
                  {ticket.customer.name?.[0] || (ticket.customer.email?.[0]?.toUpperCase() || "?")}
                </span>
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {ticket.customer.name || ticket.customer.email}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-xs text-gray-500" suppressHydrationWarning>
                      {mounted ? format(new Date(ticket.createdAt), 'PPp', { locale: es }) : ''}
                    </p>
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      Descripción del ticket
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">
                {ticket.description}
              </div>

              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase">Archivos Adjuntos</p>
                  <div className="flex flex-wrap gap-2">
                    {ticket.attachments.map((attachment, index) => {
                      const fileName = attachment.split('/').pop() || `Archivo ${index + 1}`
                      const isUrl = attachment.startsWith('http') || attachment.startsWith('/')
                      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
                      
                      if (isUrl && isImage) {
                        return (
                          <div key={index} className="relative group inline-block">
                            <a 
                              href={attachment} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <img src={attachment} alt={fileName} className="max-w-full h-auto max-h-64 rounded-lg shadow-sm border border-gray-200 transition-opacity group-hover:opacity-90" />
                            </a>
                            <a
                              href={attachment}
                              download={fileName}
                              className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Descargar imagen"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        )
                      }
                      
                      return isUrl ? (
                        <div key={index} className="flex items-center bg-primary-50 rounded-lg border border-primary-100 overflow-hidden">
                          <a 
                            href={attachment} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center space-x-2 text-sm text-primary-600 px-3 py-3 hover:bg-primary-100 flex-1 min-w-0"
                          >
                            <Paperclip className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate block">{fileName}</span>
                          </a>
                          <a
                            href={attachment}
                            download={fileName}
                            className="p-3 flex-shrink-0 text-primary-600 hover:bg-primary-100 border-l border-primary-100 transition-colors"
                            title="Descargar archivo"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      ) : (
                        <button
                          key={index}
                          type="button"
                          onClick={() => toast(`El archivo "${fileName}" es un registro visual. La funcionalidad de subir archivos reales está en desarrollo.`, { icon: 'ℹ️' })}
                          className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100 text-left"
                        >
                          <Paperclip className="h-4 w-4 text-gray-400" />
                          <span className="truncate max-w-xs">{fileName}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mensajes */}
      {messages.map((message) => {
        const isCurrentUser = message.author.id === currentUserId
        const isInternal = message.isInternal
        const isSystem = message.type === 'SYSTEM'

        return (
          <div key={message.id} className={`${isInternal ? 'bg-yellow-50' : isSystem ? 'bg-gray-50' : 'bg-white'} rounded-lg p-6 shadow-sm`}>
            {isSystem ? (
              // Mensaje de sistema (cambios de estado, asignaciones, etc.)
              <div className="flex items-center justify-center space-x-2">
                <div className="h-px flex-1 bg-gray-300"></div>
                <p className="text-xs text-gray-600 px-4">
                  <span className="font-medium">{message.author.name || message.author.email}</span>: {message.content}
                </p>
                <div className="h-px flex-1 bg-gray-300"></div>
              </div>
            ) : (
              // Mensaje normal
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-600 font-medium">
                      {message.author.name?.[0] || (message.author.email?.[0]?.toUpperCase() || "?")}
                    </span>
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {message.author.name || message.author.email}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <p className="text-xs text-gray-500" suppressHydrationWarning>
                          {mounted ? format(new Date(message.createdAt), 'PPp', { locale: es }) : ''}
                        </p>
                        {isInternal && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-200 text-yellow-800 rounded">
                            Nota interna
                          </span>
                        )}
                      </div>
                    </div>
                    {isCurrentUser && (Date.now() - new Date(message.createdAt).getTime() <= 60000) && mounted && (
                      <button
                        onClick={() => handleDeleteMessage(message.id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
                        title="Eliminar mensaje"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">
                    {message.content}
                  </div>

                  {message.attachments.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {message.attachments.map((attachment, index) => {
                        const fileName = attachment.split('/').pop() || `Archivo ${index + 1}`
                        const isUrl = attachment.startsWith('http') || attachment.startsWith('/')
                        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
                        
                        if (isUrl && isImage) {
                          return (
                            <div key={index} className="relative group inline-block">
                              <a
                                href={attachment}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img src={attachment} alt={fileName} className="max-w-full h-auto max-h-64 rounded-lg shadow-sm border border-gray-200 transition-opacity group-hover:opacity-90" />
                              </a>
                              <a
                                href={attachment}
                                download={fileName}
                                className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Descargar imagen"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </div>
                          )
                        }
                        
                        return isUrl ? (
                          <div key={index} className="flex items-center bg-primary-50 rounded-lg border border-primary-100 overflow-hidden">
                            <a
                              href={attachment}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-2 text-sm text-primary-600 px-3 py-3 hover:bg-primary-100 flex-1 min-w-0"
                            >
                              <Paperclip className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate block">{fileName}</span>
                            </a>
                            <a
                              href={attachment}
                              download={fileName}
                              className="p-3 flex-shrink-0 text-primary-600 hover:bg-primary-100 border-l border-primary-100 transition-colors"
                              title="Descargar archivo"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        ) : (
                          <button
                            key={index}
                            type="button"
                            onClick={() => toast(`El archivo "${fileName}" es un registro visual. La funcionalidad de subir archivos reales está en desarrollo.`, { icon: 'ℹ️' })}
                            className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100 text-left"
                          >
                            <Paperclip className="h-4 w-4 text-gray-400" />
                            <span className="truncate max-w-xs">{fileName}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
