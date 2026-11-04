'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { COMPANY_DEFAULTS } from '@/lib/accounting/company-defaults'

interface GeneralSettingsProps {
  initialOrgName?: string
  initialOrgEmail?: string
  initialOrgLogo?: string
  initialDisableLanding?: string
  initialEnableCustomerUsers?: string
  /** Company identity and document texts printed on quotes and billing accounts. */
  initialCompany?: Record<string, string>
}

const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500'

export default function GeneralSettings({
  initialOrgName = 'SIP SOPORTE',
  initialOrgEmail = 'soporte@desk20.com',
  initialOrgLogo = '',
  initialDisableLanding = 'false',
  initialEnableCustomerUsers = 'false',
  initialCompany = {}
}: GeneralSettingsProps) {
  const [loading, setLoading] = useState(false)
  // Empty stored values fall back to the document defaults so the texts are visible and editable.
  const company = (key: keyof typeof COMPANY_DEFAULTS) => (initialCompany[key] ?? '').trim() || COMPANY_DEFAULTS[key]
  const [formData, setFormData] = useState({
    org_name: initialOrgName,
    org_email: initialOrgEmail,
    org_logo: initialOrgLogo,
    org_nit: company('org_nit'),
    org_phone: company('org_phone'),
    org_website: company('org_website'),
    org_address: company('org_address'),
    org_city: company('org_city'),
    quote_conditions: company('quote_conditions'),
    billing_payment_info: company('billing_payment_info'),
    billing_legal_note: company('billing_legal_note'),
    billing_due_days: company('billing_due_days'),
    DISABLE_LANDING_PAGE: initialDisableLanding,
    ENABLE_CUSTOMER_USERS: initialEnableCustomerUsers
  })

  const handleSave = async () => {
    const dueDays = formData.billing_due_days.trim()
    if (!/^[0-9]+$/.test(dueDays) || Number(dueDays) > 365) {
      toast.error('Los días de vencimiento deben ser un entero entre 0 y 365')
      return
    }
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
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Datos de la empresa (documentos)</h3>
          <p className="text-sm text-gray-500 mb-4">Se imprimen en el membrete de cotizaciones y cuentas de cobro.</p>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">NIT</label>
                <input type="text" maxLength={50} value={formData.org_nit} onChange={e => setFormData({ ...formData, org_nit: e.target.value })} placeholder="901.392.637-0" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono</label>
                <input type="tel" maxLength={100} value={formData.org_phone} onChange={e => setFormData({ ...formData, org_phone: e.target.value })} placeholder="+57 320 887 57 62" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sitio web</label>
              <input type="text" maxLength={200} value={formData.org_website} onChange={e => setFormData({ ...formData, org_website: e.target.value })} placeholder="www.ejemplo.com" className={inputClass} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
                <input type="text" maxLength={200} value={formData.org_address} onChange={e => setFormData({ ...formData, org_address: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ciudad</label>
                <input type="text" maxLength={100} value={formData.org_city} onChange={e => setFormData({ ...formData, org_city: e.target.value })} placeholder="Bogotá" className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Cotizaciones y cuentas de cobro</h3>
          <p className="text-sm text-gray-500 mb-4">Textos y plazos que aparecen en los documentos nuevos; los ya emitidos no cambian.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Formas de pago y consideraciones de las cotizaciones</label>
              <textarea rows={5} maxLength={4000} value={formData.quote_conditions} onChange={e => setFormData({ ...formData, quote_conditions: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Instrucciones de pago de las cuentas de cobro (cuentas bancarias, Nequi, etc.)</label>
              <textarea rows={3} maxLength={2000} value={formData.billing_payment_info} onChange={e => setFormData({ ...formData, billing_payment_info: e.target.value })} placeholder="Nequi cuenta No. ... / Cuenta de ahorros No. ..." className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nota legal al pie de la cuenta de cobro</label>
              <textarea rows={3} maxLength={2000} value={formData.billing_legal_note} onChange={e => setFormData({ ...formData, billing_legal_note: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Días de vencimiento de las cuentas de cobro</label>
              <input type="number" min={0} max={365} step={1} inputMode="numeric" value={formData.billing_due_days} onChange={e => setFormData({ ...formData, billing_due_days: e.target.value })} className={inputClass} />
              <p className="text-sm text-gray-500 mt-1">0 = contra entrega (sin fecha de vencimiento).</p>
            </div>
          </div>
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
