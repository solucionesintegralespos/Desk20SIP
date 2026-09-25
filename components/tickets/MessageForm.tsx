'use client'

import { useState } from 'react'
import { Send, Paperclip, Sparkles, File as FileIcon, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

interface MessageFormProps {
  ticketId: string
  currentUserId: string
}

export default function MessageForm({ ticketId, currentUserId }: MessageFormProps) {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setAttachments(prev => [...prev, ...newFiles])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const newFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const extension = file.type.split('/')[1] || 'png';
          const pastedFile = new File([file], `pasted_image_${Date.now()}.${extension}`, { type: file.type });
          newFiles.push(pastedFile);
        }
      }
    }

    if (newFiles.length > 0) {
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const uploadedUrls: string[] = []
    
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        
        if (response.ok) {
          const data = await response.json()
          uploadedUrls.push(data.url)
        } else {
          console.error('Error al subir archivo:', await response.text())
        }
      } catch (error) {
        console.error('Error uploading file:', error)
      }
    }
    
    return uploadedUrls
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!content.trim()) return

    setLoading(true)

    try {
      const attachmentUrls = await uploadFiles(attachments)
      // Detectar si el mensaje contiene @ia
      const hasAiMention = content.toLowerCase().includes('@ia')
      
      if (hasAiMention) {
        // Primero enviar el mensaje del usuario
        const userMessageResponse = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticketId,
            content,
            isInternal: true, // Los mensajes con @ia son internos por defecto
            attachments: attachmentUrls,
          }),
        })

        if (!userMessageResponse.ok) {
          throw new Error('Error al enviar mensaje')
        }

        // Luego llamar a la IA
        setAiLoading(true)
        const aiResponse = await fetch('/api/ai/ticket-assist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticketId,
            userMessage: content,
          }),
        })

        if (!aiResponse.ok) {
          const errorData = await aiResponse.json()
          console.error('Error de IA:', errorData)
          // No lanzamos error para que el mensaje del usuario sí se guarde
        }
      } else {
        // Mensaje normal sin IA
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticketId,
            content,
            isInternal,
            attachments: attachmentUrls,
          }),
        })

        if (!response.ok) {
          throw new Error('Error al enviar mensaje')
        }
      }

      setContent('')
      setIsInternal(false)
      setAttachments([])
      router.refresh()
    } catch (error) {
      console.error('Error sending message:', error)
      toast.error('Error al enviar el mensaje')
    } finally {
      setLoading(false)
      setAiLoading(false)
    }
  }

  return (
    <div className="bg-white border-t p-6">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={handlePaste}
            placeholder="Escribe tu respuesta... (usa @ia para ayuda, puedes pegar imágenes Ctrl+V)"
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          />
          {content.toLowerCase().includes('@ia') && (
            <div className="mt-2 flex items-center space-x-2 text-sm text-purple-600">
              <Sparkles className="h-4 w-4" />
              <span>El asistente de IA analizará el ticket y te ayudará con una respuesta</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="message-file-upload"
              />
              <label
                htmlFor="message-file-upload"
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                <Paperclip className="h-5 w-5" />
                <span className="text-sm">Adjuntar archivo</span>
              </label>
            </div>
            
            {!content.toLowerCase().includes('@ia') && (
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Nota interna</span>
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || aiLoading || !content.trim()}
            className="flex items-center space-x-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {aiLoading ? (
              <>
                <Sparkles className="h-4 w-4 animate-pulse" />
                <span>Consultando IA...</span>
              </>
            ) : loading ? (
              <>
                <Send className="h-4 w-4" />
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Enviar</span>
              </>
            )}
          </button>
        </div>

        {attachments.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Archivos seleccionados ({attachments.length}):
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {attachments.map((file, index) => {
                const isImage = file.type.startsWith('image/')
                return (
                  <div
                    key={index}
                    className="relative group rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm"
                  >
                    {isImage ? (
                      <div className="aspect-square sm:aspect-video w-full bg-gray-100 flex items-center justify-center overflow-hidden">
                        <img 
                          src={URL.createObjectURL(file)} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="aspect-square sm:aspect-video w-full bg-gray-50 flex items-center justify-center">
                        <FileIcon className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                    <div className="p-3 bg-white border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded-full text-red-500 hover:text-red-700 shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200"
                      title="Eliminar archivo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
