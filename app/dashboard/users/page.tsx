import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import UsersTable from '@/components/users/UsersTable'
import CreateUserButton from '@/components/users/CreateUserButton'


interface SearchParams {
  role?: string
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/login')
  }

  // Obtener usuario completo con su rol
  const user = await getDashboardUser()

  if (!user) {
    redirect('/login')
  }

  // Validar que solo ADMIN pueda acceder a esta página
  if (user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  const whereClause: any = { role: { in: ['ADMIN', 'AGENT'] } }
  
  if (searchParams.role && ['ADMIN', 'AGENT'].includes(searchParams.role)) {
    whereClause.role = searchParams.role
  }

  const [users, statsResult] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        dailyEntryGoal: true, dailyClosureGoal: true,
        role: true,
        phone: true,
        location: true,
        createdAt: true,
        _count: {
          select: {
            createdTickets: true,
            ticketAssignments: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    }),
    prisma.$transaction([
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'AGENT' } }),
      prisma.user.count({ where: { role: { in: ['ADMIN', 'AGENT'] } } }),
      prisma.ticket.count({ where: { status: 'OPEN' } })
    ])
  ])

  const stats = statsResult
  

  return (
    <>
      
      
      <div className="h-full flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Usuarios</h1>
              <p className="text-gray-600 mt-1">Gestiona usuarios, roles y permisos</p>
            </div>
            <CreateUserButton />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Administradores</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stats[0]}</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-lg">
                  <span className="text-2xl">👑</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Agentes</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stats[1]}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <span className="text-2xl">👨‍💼</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total de usuarios</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stats[2]}</p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <span className="text-2xl">👥</span>
                </div>
              </div>
            </div>
          </div>

          

          <UsersTable currentRole={searchParams.role} users={users.map(u => ({ ...u, _count: { ...u._count, assignedTickets: u._count.ticketAssignments } }))} />
        </div>
      </div></>
  )
}
