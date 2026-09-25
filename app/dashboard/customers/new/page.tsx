import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import CreateCustomerForm from '@/components/customers/CreateCustomerForm'

export default async function NewCustomerPage() {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/login')
  }

  // Obtener usuario completo con su rol
  const user = await getDashboardUser()

  if (!user) {
    redirect('/login')
  }

  // Validar que CUSTOMER no pueda acceder a esta página
  if (user.role === 'CUSTOMER') {
    redirect('/dashboard')
  }

  // AGENT y ADMIN ven todos los tickets
  

  return (
    <>
      
      
      <div className="h-full flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Crear Nuevo Cliente</h1>
            <p className="text-gray-600 mt-1">Completa el formulario para agregar un cliente</p>
          </div>

          <CreateCustomerForm />
        </div>
      </div></>
  )
}
