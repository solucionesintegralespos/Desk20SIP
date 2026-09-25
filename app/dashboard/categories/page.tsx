import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import CategoriesTable from '@/components/categories/CategoriesTable'
import CreateCategoryButton from '@/components/categories/CreateCategoryButton'

export const metadata: Metadata = {
  title: 'Categorías | SIP SOPORTE',
  description: 'Gestión de categorías'
}

export default async function CategoriesPage() {
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
  if (user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  // AGENT y ADMIN ven todos los tickets
  

  return (
    <>
      
      
      <div className="h-full flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Categorías</h1>
              <p className="text-gray-600 mt-2">
                Gestiona las categorías del sistema
              </p>
            </div>
            <CreateCategoryButton />
          </div>

          <CategoriesTable />
        </div>
      </div></>
  )
}
