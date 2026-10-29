'use client'

import { useState } from 'react'
import { X, UserPlus, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

export interface CreatedCustomer {
  id: string
  name: string | null
  email: string | null
  phone?: string | null
  location?: string | null
}

interface CreateCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  onCustomerCreated: (customer: CreatedCustomer) => void
  existingNames?: string[]
}

export default function CreateCustomerModal({
  isOpen,
  onClose,
  onCustomerCreated,
  existingNames,
}: CreateCustomerModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    address: '',
  })

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedName = formData.name.trim()
    if (!trimmedName) {
      setError('El nombre del cliente es obligatorio')
      return
    }

    if (existingNames && existingNames.some(n => n && n.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setError('Ya existe un cliente con este nombre')
      return
    }

    const trimmedEmail = formData.email.trim()
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Ingresa un correo electrónico válido')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail || undefined,
          phone: formData.phone.trim() || undefined,
          location: formData.location.trim() || undefined,
          address: formData.address.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Cliente creado correctamente')
        onCustomerCreated(data)
        onClose()
      } else {
        setError(data.error || 'Error al crear cliente')
      }
    } catch (err) {
      console.error('Error al crear cliente:', err)
      setError('Error al crear cliente. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-customer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 id="create-customer-title" className="text-lg font-semibold text-gray-900">
                Nuevo Cliente
              </h2>
              <p className="text-xs text-gray-500">
                Registra un nuevo cliente para asociarlo al ticket
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej. Acme Corp o Juan Pérez"
              className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo Electrónico <span className="text-xs text-gray-500 font-normal">(Opcional)</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="cliente@ejemplo.com"
              className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono <span className="text-xs text-gray-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+57 300 123 4567"
                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ubicación / Ciudad <span className="text-xs text-gray-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Bogotá, Colombia"
                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dirección <span className="text-xs text-gray-500 font-normal">(Opcional)</span>
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Calle 100 # 15-20"
              className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? 'Creando...' : 'Crear y Seleccionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

