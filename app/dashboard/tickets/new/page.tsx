import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import CreateTicketForm from '@/components/tickets/CreateTicketForm'

export default async function NewTicketPage() {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/login')
  }

  // Obtener usuario completo con su rol
  const user = await getDashboardUser()

  if (!user) {
    redirect('/login')
  }

  // Filtrar contador según el rol
  const countWhere = user.role === 'CUSTOMER' 
    ? { status: 'OPEN' as const, customerId: user.id }
    : { status: 'OPEN' as const }
  

  return (
    <>
      
      
      <div className="h-full flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Crear Nuevo Ticket</h1>
            <p className="text-gray-600 mt-1">Completa el formulario para crear un ticket de soporte</p>
          </div>

          <CreateTicketForm currentUser={{ id: user.id, role: user.role }} />
        </div>
      </div></>
  )
}
