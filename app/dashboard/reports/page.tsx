import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ReportsDashboard from '@/components/reports/ReportsDashboard'
import { isAdmin } from '@/lib/roles'

export const metadata = {
  title: 'Reportes | SIP SOPORTE',
  description: 'Métricas y estadísticas de tickets'
}

export default async function ReportsPage() {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/login')
  }

  // Obtener usuario
  const user = await getDashboardUser()

  if (!user || !isAdmin(user.role)) {
    redirect('/dashboard')
  }

  

  return (
    <>
      
      
      <div className="h-full overflow-y-auto">
        <div className="p-4 md:p-8 pb-16">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Reportes</h1>
            <p className="text-gray-600 mt-1">Rendimiento mensual del equipo</p>
          </div>

          <ReportsDashboard />
        </div>
      </div></>
  )
}
