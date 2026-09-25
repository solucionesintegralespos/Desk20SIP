import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CreateCategoryForm from '@/components/categories/CreateCategoryForm'

export const metadata: Metadata = {
  title: 'Nueva Categoría | SIP SOPORTE',
  description: 'Crear nueva categoría'
}

export default async function NewCategoryPage() {
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
          <Link
            href="/dashboard/categories"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a categorías
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Nueva Categoría</h1>
            <p className="text-gray-600 mt-2">
              Crea una nueva categoría en el sistema
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6 max-w-2xl">
            <CreateCategoryForm />
          </div>
        </div>
      </div></>
  )
}
