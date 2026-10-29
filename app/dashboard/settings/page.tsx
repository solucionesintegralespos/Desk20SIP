import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import path from 'path'
import ChatGPTSettings from '@/components/settings/ChatGPTSettings'
import TwoFactorSettings from '@/components/settings/TwoFactorSettings'
import GeneralSettings from '@/components/settings/GeneralSettings'
import { SupportProvider } from '@/lib/support/context'
import { Templates } from '@/components/support/templates'
import { Settings as SettingsIcon, Mail, Globe, Shield } from 'lucide-react'

export const metadata = {
  title: 'Configuración | SIP SOPORTE',
  description: 'Configuración del sistema'
}

export default async function SettingsPage() {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/login')
  }

  // Leer versión del package.json
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const systemVersion = packageJson.version

  // Obtener fecha del build
  let buildDate = new Date()
  try {
    const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID')
    if (fs.existsSync(buildIdPath)) {
      buildDate = fs.statSync(buildIdPath).mtime
    } else {
      buildDate = fs.statSync(path.join(process.cwd(), '.next')).mtime
    }
  } catch (e) {
    console.error('Error al obtener fecha del build', e)
  }

  const formattedBuildDate = buildDate.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  // Obtener usuario completo con su rol
  const user = await getDashboardUser()

  if (!user) {
    redirect('/login')
  }

  // Validar que solo ADMIN pueda acceder
  if (user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  // Solo ADMIN ve todos los tickets
  

  // Obtener estadísticas del sistema
  const stats = await prisma.$transaction([
    prisma.user.count(),
    prisma.ticket.count(),
    prisma.category.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
  ])

  // Obtener configuración de IA (Google Gemini / OpenAI)
  const aiSettings = await prisma.setting.findMany({
    where: {
      key: {
        in: ['chatgpt_api_key', 'gemini_api_key', 'ai_api_key', 'ai_provider', 'ai_model']
      }
    }
  })
  const aiConfig = aiSettings.reduce((acc, setting) => {
    acc[setting.key] = setting.value
    return acc
  }, {} as Record<string, string>)

  // Obtener configuracion de Organizacion
  const orgSettings = await prisma.setting.findMany({
    where: {
      key: {
        in: ['org_name', 'org_email', 'org_logo', 'DISABLE_LANDING_PAGE', 'ENABLE_CUSTOMER_USERS']
      }
    }
  })

  const orgInfo = orgSettings.reduce((acc, setting) => {
    acc[setting.key] = setting.value
    return acc
  }, {} as Record<string, string>)

  return (
    <>
      

      <div className="h-full flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
            <p className="text-gray-600 mt-1">Administra la configuración del sistema</p>
          </div>

          {/* Estadísticas del Sistema */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Usuarios</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats[0]}</p>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Tickets</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats[1]}</p>
                </div>
                <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Categorías</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats[2]}</p>
                </div>
                <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Globe className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Administradores</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats[3]}</p>
                </div>
                <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </div>

          </div>

          {/* Secciones de Configuración */}
          <section className="service-module bg-white rounded-lg shadow p-6 mb-8">
            <SupportProvider><Templates /></SupportProvider>
          </section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Autenticación de Dos Factores */}
            <TwoFactorSettings
              initialEnabled={user.twoFactorEnabled}
              userId={user.id}
            />

            {/* Integración Inteligencia Artificial (Gemini / ChatGPT) */}
            <ChatGPTSettings
              initialApiKey={aiConfig.ai_api_key || aiConfig.gemini_api_key || aiConfig.chatgpt_api_key || ''}
              initialProvider={aiConfig.ai_provider || 'auto'}
              initialModel={aiConfig.ai_model || ''}
            />

            {/* Configuración General */}
            <GeneralSettings
              initialOrgName={orgInfo.org_name}
              initialOrgEmail={orgInfo.org_email}
              initialOrgLogo={orgInfo.org_logo}
              initialDisableLanding={orgInfo.DISABLE_LANDING_PAGE}
              initialEnableCustomerUsers={orgInfo.ENABLE_CUSTOMER_USERS}
            />

            {/* Configuración de Sistema */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <div className="flex items-center space-x-3">
                  <SettingsIcon className="h-6 w-6 text-primary-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Sistema</h2>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">Versión del Sistema</p>
                  <p className="text-sm text-gray-600">v{systemVersion}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">Base de Datos</p>
                  <p className="text-sm text-gray-600">PostgreSQL (Conectado)</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">Última Actualización</p>
                  <p className="text-sm text-gray-600">{formattedBuildDate}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div></>
  )
}
