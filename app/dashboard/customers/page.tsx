import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import CustomersTable from '@/components/customers/CustomersTable'
import CreateCustomerButton from '@/components/customers/CreateCustomerButton'
import CustomerStats from '@/components/customers/CustomerStats'

export default async function CustomersPage() {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/login')
  }

  // Obtener el usuario con su rol
  const user = await getDashboardUser()

  if (!user) {
    redirect('/login')
  }

  const [customers, statsArray] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: 'CUSTOMER'
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        phone: true,
        location: true,
        address: true,
        organizationId: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
          }
        },
        _count: {
          select: {
            createdTickets: true,
          }
        },
        createdTickets: {
          select: {
            status: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    }),
    prisma.$transaction([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.ticket.count({ where: { customer: { role: 'CUSTOMER' }, status: 'OPEN' } }),
      prisma.ticket.count({ where: { customer: { role: 'CUSTOMER' } } }),
      prisma.ticket.count({ where: { status: 'OPEN' } })
    ])
  ])

  const stats = statsArray
  

  return (
    <>
      
      
      <div className="h-full flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
              <p className="text-gray-600 mt-1">Gestiona tu base de clientes</p>
            </div>
            <CreateCustomerButton />
          </div>

          <CustomerStats 
            totalCustomers={stats[0]}
            openTickets={stats[1]}
            totalTickets={stats[2]}
          />

          <CustomersTable customers={customers} />
        </div>
      </div></>
  )
}
