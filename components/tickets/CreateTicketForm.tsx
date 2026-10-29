'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload, X, File as FileIcon, Sparkles, UserPlus } from 'lucide-react'
import Link from 'next/link'
import TechnicianPicker from './TechnicianPicker'
import CreateCustomerModal from '@/components/customers/CreateCustomerModal'
import { showTicketCreatedNotice } from './TicketCreatedNotice'
import { useTicketsListHref } from '@/lib/tickets-list-query'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { toast } from 'react-hot-toast'
import { acceptFiles, UploadError, UPLOAD_ACCEPT, MAX_UPLOAD_MB } from '@/lib/upload-limits'

interface Category {
  id: string
  name: string
}

interface Customer {
  id: string
  name: string | null
  email: string | null
}

interface CreateTicketFormProps {
  currentUser: {
    id: string
    role: string
    name?: string | null
  }
  /** Prefilled values, e.g. when a schedule event is turned into a ticket. */
  initial?: { subject?: string; description?: string; customerId?: string; assigneeIds?: string[]; source?: string }
}

export default function CreateTicketForm({ currentUser, initial }: CreateTicketFormProps) {
  const router = useRouter()
  const ticketsListHref = useTicketsListHref()
  const [loading, setLoading] = useState(false)
  const [improvingText, setImprovingText] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [error, setError] = useState('')
  // Field-level messages appear after the first attempt to create the ticket.
  const [attempted, setAttempted] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [formData, setFormData] = useState({
    customerId: currentUser.role === 'CUSTOMER' ? currentUser.id : initial?.customerId || '',
    subject: initial?.subject || '',
    description: initial?.description || '',
    // Most tickets are normal-priority incidents; both stay editable.
    priority: 'NORMAL',
    type: 'INCIDENT',
    categoryId: '',
    hours: '',
    tags: '',
    assigneeIds: initial?.assigneeIds || [] as string[],
  })
  const [attachments, setAttachments] = useState<File[]>([])
  const [agents, setAgents] = useState<Array<{ id: string; name: string | null; email: string | null }>>([])

  useEffect(() => {
    fetchCategories()
    fetchAgents()
    if (currentUser.role !== 'CUSTOMER') {
      fetchCustomers()
    }
  }, [])

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/tickets/options')
      if (response.ok) {
        const data = await response.json()
        setAgents(data.agents)
        // The creator is preselected when they are a technician; it can be changed but never left empty
        // (the form and the API both reject a ticket without technicians).
        setFormData(prev => ({ ...prev, assigneeIds: prev.assigneeIds.length ? prev.assigneeIds : data.agents.some((a: { id: string }) => a.id === currentUser.id) ? [currentUser.id] : [] }))
      }
    } catch (error) {
      console.error('Error al cargar agentes:', error)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/tickets/options')
      if (response.ok) {
        const data = await response.json()
        setCategories(data.categories)
      }
    } catch (error) {
      console.error('Error al cargar categorías:', error)
    }
  }

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers')
      if (response.ok) {
        const data = await response.json()
        setCustomers(data)
      }
    } catch (error) {
      console.error('Error al cargar clientes:', error)
    }
  }

  // Files over the limit or of an unsupported type are refused here, with a warning,
  // before any upload starts; the server enforces the same rules.
  const addFiles = (files: File[]) => {
    const { accepted, rejected } = acceptFiles(files)
    rejected.forEach(reason => toast.error(reason, { duration: 8000 }))
    if (accepted.length) setAttachments(prev => [...prev, ...accepted])
  }
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    // Allow choosing the same file again after removing it.
    e.target.value = ''
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

    if (newFiles.length > 0) addFiles(newFiles);
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
        
        if (!response.ok) {
          const detail = await response.json().catch(() => null)
          throw new UploadError(detail?.error || `No se pudo subir «${file.name}».`)
        }
        const data = await response.json()
        uploadedUrls.push(data.url)
      } catch (error) {
        if (error instanceof UploadError) throw error
        console.error('Error uploading file:', error)
        throw new UploadError(`No se pudo subir «${file.name}». Revisa la conexión e inténtalo de nuevo.`)
      }
    }
    
    return uploadedUrls
  }

  const handleImproveText = async () => {
    if (!formData.description.trim()) {
      setError('Escribe una descripción primero')
      return
    }

    setImprovingText(true)
    setError('')

    try {
      const response = await fetch('/api/ai/improve-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: formData.description,
          subject: formData.subject
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setFormData({ ...formData, description: data.improvedText })
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Error al mejorar el texto')
      }
    } catch (error) {
      console.error('Error improving text:', error)
      setError('Error al mejorar el texto')
    } finally {
      setImprovingText(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    if (!formData.assigneeIds.length) { setError('Asigna al menos un técnico al ticket'); return }
    if (!formData.customerId || !formData.priority || !formData.type || !formData.categoryId) {
      setError('Selecciona cliente, prioridad, tipo y categoría'); return
    }
    setLoading(true)
    setError('')

    try {
      // Subir archivos si hay
      const attachmentUrls = await uploadFiles(attachments)
      
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          customerId: formData.customerId,
          type: formData.type || null,
          categoryId: formData.categoryId || null,
          assigneeIds: formData.assigneeIds,
          hours: formData.hours ? parseFloat(formData.hours) : null,
          tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
          attachments: attachmentUrls
        }),
      })

      if (response.ok) {
        const ticket = await response.json()
        if (currentUser.role !== 'CUSTOMER') showTicketCreatedNotice(ticket)
        router.push(`/dashboard/tickets/${ticket.id}`)
      } else {
        const data = await response.json()
        setError(data.error || 'Error al crear el ticket')
      }
    } catch (error) {
      console.error('Error creating ticket:', error)
      // A refused attachment stops the ticket; the message names the file.
      setError(error instanceof UploadError ? error.message : 'Error al crear el ticket')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <Link 
          href={ticketsListHref}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a tickets
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {initial?.source && <p role="status" className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          Datos tomados de {initial.source}. Completa la categoría, el tipo y la prioridad para crear el ticket.
        </p>}
        {/* The API records the session user as the creator. */}
        <div>
          <label htmlFor="ticket-creator" className="block text-sm font-medium text-gray-700 mb-2">Creado por</label>
          <input id="ticket-creator" readOnly value={currentUser.name || 'Usuario actual'} className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="ticket-customer" className="block text-sm font-medium text-gray-700">
              Cliente <span className="text-red-500">*</span>
            </label>
            {currentUser.role !== 'CUSTOMER' && (
              <button
                type="button"
                onClick={() => setShowCustomerModal(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Nuevo cliente</span>
              </button>
            )}
          </div>
          {currentUser.role === 'CUSTOMER' ? (
            <select id="ticket-customer" value={currentUser.id} disabled className="w-full px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:cursor-not-allowed">
              <option value={currentUser.id}>Mi cuenta</option>
            </select>
          ) : (
            <SearchSelect
              id="ticket-customer"
              placeholder="Buscar cliente por nombre o correo…"
              options={customers.map(customer => ({ id: customer.id, label: customer.name || customer.email || 'Sin nombre', description: customer.name ? customer.email || undefined : undefined }))}
              value={formData.customerId}
              onChange={customerId => setFormData({ ...formData, customerId })}
            />
          )}
          {attempted && !formData.customerId && (
            <p className="mt-1 text-xs text-red-600">Selecciona o crea un cliente para el ticket.</p>
          )}
        </div>

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
            placeholder="Describe el problema brevemente"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Descripción
            </label>
            <button
              type="button"
              onClick={handleImproveText}
              disabled={improvingText || !formData.description.trim()}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {improvingText ? 'Mejorando...' : 'Mejorar con IA'}
            </button>
          </div>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            onPaste={handlePaste}
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Proporciona más detalles sobre el problema. Puedes pegar imágenes (Ctrl+V)."
          />
          <p className="text-xs text-gray-500 mt-1">
            💡 Usa el botón "Mejorar con IA" para obtener una descripción más clara y profesional
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Seleccionar tipo...</option>
              <option value="INCIDENT">Incidente</option>
              <option value="CHANGE_REQUEST">Solicitud de cambio</option>
              <option value="PROJECT">Proyecto</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Seleccionar categoría...</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Horas estimadas
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={formData.hours}
              onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ej: 2.5"
            />
          </div>
        </div>

        <TechnicianPicker agents={agents} value={formData.assigneeIds} error={attempted && !formData.assigneeIds.length ? 'Asigna al menos un técnico.' : undefined}
          onChange={assigneeIds => setFormData({ ...formData, assigneeIds })} disabled={loading} />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Etiquetas
          </label>
          <input
            type="text"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Separa las etiquetas con comas (ej: bug, urgente)"
          />
          <p className="text-sm text-gray-500 mt-1">
            Las etiquetas ayudan a organizar y filtrar tickets
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Archivos Adjuntos
          </label>
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition">
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
              accept={UPLOAD_ACCEPT}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center space-y-2"
            >
              <Upload className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-gray-600">
                Haz clic para subir archivos o arrastra y suelta
              </span>
              <span className="text-xs text-gray-500">
                Imágenes, PDF, Office, TXT, CSV, ZIP o MP4 (máx. {MAX_UPLOAD_MB} MB por archivo)
              </span>
            </label>
          </div>

          {attachments.length > 0 && (
            <div className="mt-4">
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
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Link
            href={ticketsListHref}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creando...' : 'Crear Ticket'}
          </button>
        </div>
      </form>

      {showCustomerModal && (
        <CreateCustomerModal
          isOpen={showCustomerModal}
          onClose={() => setShowCustomerModal(false)}
          existingNames={customers.map(c => c.name || '')}
          onCustomerCreated={(newCustomer) => {
            setCustomers(prev => [newCustomer, ...prev])
            setFormData(prev => ({ ...prev, customerId: newCustomer.id }))
          }}
        />
      )}
    </div>
  )
}
