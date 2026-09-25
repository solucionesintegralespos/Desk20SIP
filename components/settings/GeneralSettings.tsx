'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface GeneralSettingsProps {
  initialOrgName?: string
  initialOrgEmail?: string
  initialOrgLogo?: string
  initialDisableLanding?: string
  initialEnableCustomerUsers?: string
}

export default function GeneralSettings({
  initialOrgName = 'SIP SOPORTE',
  initialOrgEmail = 'soporte@desk20.com',
  initialOrgLogo = '',
  initialDisableLanding = 'false',
  initialEnableCustomerUsers = 'false'
}: GeneralSettingsProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    org_name: initialOrgName,
    org_email: initialOrgEmail,
    org_logo: initialOrgLogo,
    DISABLE_LANDING_PAGE: initialDisableLanding,
    ENABLE_CUSTOMER_USERS: initialEnableCustomerUsers
  })

  const handleSave = async () => {
    setLoading(true)
    try {
      // Save each setting
      for (const [key, value] of Object.entries(formData)) {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        })
      }
      toast.success('Configuración guardada correctamente. Refresca la página para ver los cambios.')
    } catch (error) {
      console.error('Error al guardar configuración:', error)
      toast.error('Error al guardar configuración')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Building2 className="h-6 w-6 text-primary-600" />
          <h2 className="text-xl font-semibold text-gray-900">Información General</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
        >
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nombre de la Organización
          </label>
          <input
            type="text"
            value={formData.org_name}
            onChange={e => setFormData({ ...formData, org_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email de Soporte
          </label>
          <input
            type="email"
            value={formData.org_email}
            onChange={e => setFormData({ ...formData, org_email: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Logo URL (Opcional)
          </label>
          <input
            type="text"
            value={formData.org_logo}
            onChange={e => setFormData({ ...formData, org_logo: e.target.value })}
            placeholder="https://ejemplo.com/logo.png"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {formData.org_logo && (
            <div className="mt-2">
              <img src={formData.org_logo} alt="Logo preview" className="h-8 object-contain" />
            </div>
          )}
        </div>

        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Opciones Avanzadas</h3>
          
          <div className="space-y-4">
            <label className="flex items-start space-x-3 cursor-pointer">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={formData.DISABLE_LANDING_PAGE === 'true'}
                  onChange={e => setFormData({ ...formData, DISABLE_LANDING_PAGE: e.target.checked ? 'true' : 'false' })}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700">Desactivar Landing Page</span>
                <span className="text-sm text-gray-500">Redirigir a los visitantes directamente al inicio de sesión o panel</span>
              </div>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={formData.ENABLE_CUSTOMER_USERS === 'true'}
                  onChange={e => setFormData({ ...formData, ENABLE_CUSTOMER_USERS: e.target.checked ? 'true' : 'false' })}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700">Crear Credenciales para Clientes</span>
                <span className="text-sm text-gray-500">Solicitar y generar contraseña al crear un cliente nuevo</span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
