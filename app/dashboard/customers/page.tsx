import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import CustomersTable from '@/components/customers/CustomersTable'
import CreateCustomerButton from '@/components/customers/CreateCustomerButton'
import CustomerStats from '@/components/customers/CustomerStats'
import Pagination from '@/components/tickets/Pagination'

const PER_PAGE = 20

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string }
}) {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/login')
  }

  // Obtener el usuario con su rol
  const user = await getDashboardUser()

  if (!user) {
    redirect('/login')
  }

  // Search and pagination run in the database so large directories stay fast.
  const query = searchParams.q?.trim().slice(0, 100) || ''
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    ...(query ? { OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
      { organization: { name: { contains: query, mode: 'insensitive' } } },
    ] } : {}),
  }
  const matching = await prisma.user.count({ where })
  const totalPages = Math.max(1, Math.ceil(matching / PER_PAGE))
  const page = Math.min(Math.max(1, parseInt(searchParams.page || '1') || 1), totalPages)

  const [customers, statsArray] = await Promise.all([
    prisma.user.findMany({
      where,
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
        // Only open tickets are needed for the badge.
        createdTickets: {
          where: { status: 'OPEN' },
          select: {
            status: true,
          }
        }
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
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

          <CustomersTable customers={customers} hasCustomers={stats[0] > 0} query={query} />

          <Pagination currentPage={page} totalPages={totalPages} totalCount={matching} perPage={PER_PAGE} itemLabel="clientes" />
        </div>
      </div></>
  )
}
