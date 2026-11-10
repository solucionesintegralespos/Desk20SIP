'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function CreateCustomerForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [enableCustomerUsers, setEnableCustomerUsers] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    location: '',
    address: '',
    businessName: '',
    taxId: '',
    billingStartNumber: '1',
    emailNotifications: false,
  })

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && data.ENABLE_CUSTOMER_USERS === 'true') {
          setEnableCustomerUsers(true)
        }
      })
      .catch(err => console.error('Error fetching settings:', err))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Empty means 1; anything that is not a positive integer is rejected before sending.
    const startText = formData.billingStartNumber.trim()
    const billingStartNumber = startText === '' ? 1 : Number(startText)
    if (!/^[0-9]+$/.test(startText || '1') || !Number.isInteger(billingStartNumber) || billingStartNumber < 1) {
      setError('El número inicial de cuentas de cobro debe ser un entero mayor o igual a 1')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          location: formData.location.trim(),
          address: formData.address.trim(),
          businessName: formData.businessName.trim(),
          taxId: formData.taxId.trim(),
          billingStartNumber,
        }),
      })

      if (response.ok) {
        router.push('/dashboard/customers')
        router.refresh()
      } else {
        const data = await response.json()
        setError(data.error || 'Error al crear cliente')
      }
    } catch (error) {
      console.error('Error creating customer:', error)
      setError('Error al crear cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <Link 
          href="/dashboard/customers"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a clientes
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nombre Completo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Juan Pérez"
          />
        </div>

        {enableCustomerUsers && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email (Opcional)
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="cliente@ejemplo.com"
              />
              <p className="text-sm text-gray-500 mt-1">
                Si se deja en blanco, se generará uno temporal
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña (Opcional)
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Mínimo 6 caracteres"
                minLength={6}
              />
              <p className="text-sm text-gray-500 mt-1">
                Si se deja en blanco, se generará una automáticamente
              </p>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Teléfono
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="+1 234 567 8900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ubicación
          </label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Ciudad, País"
          />
        </div>

        <div>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.emailNotifications}
              onChange={(e) => setFormData({ ...formData, emailNotifications: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-gray-700">Recibir notificaciones por email</span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-6">Desactivado por defecto. Si se activa, el cliente recibirá correos al crear tickets y recibir respuestas.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Dirección
          </label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Dirección completa del cliente"
          />
        </div>

        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Datos de facturación (opcionales)</h3>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Razón social
              </label>
              <input
                type="text"
                maxLength={200}
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Nombre legal de la empresa"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NIT o cédula de ciudadanía
              </label>
              <input
                type="text"
                maxLength={200}
                value={formData.taxId}
                onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="901.392.637-0 o 1.099.206.815"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Número inicial de cuentas de cobro
              </label>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={formData.billingStartNumber}
                onChange={(e) => setFormData({ ...formData, billingStartNumber: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="1"
              />
              <p className="text-sm text-gray-500 mt-1">
                Número con el que empezará la numeración de las cuentas de cobro de este cliente. Si se deja vacío se usa 1.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Link
            href="/dashboard/customers"
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creando...' : 'Crear Cliente'}
          </button>
        </div>
      </form>
    </div>
  )
}
