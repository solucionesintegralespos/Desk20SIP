import { assignmentInclude } from '@/lib/ticket-assignees'
import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import TicketList from '@/components/dashboard/TicketList'
import StatsCards from '@/components/dashboard/StatsCards'
import { personalDashboardWhere } from '@/lib/personal-dashboard'
import PerformanceCard from '@/components/dashboard/PerformanceCard'
import { monthlyRange } from '@/lib/monthly-performance'

export default async function DashboardPage() {
  const session = await getDashboardSession()
  
  // Obtener usuario completo con su rol
  const user = await getDashboardUser()
  if (!user) redirect('/login')

  // All tickets of the user (assigned, or their own as a customer), any date.
  const statsWhere = personalDashboardWhere(user)
  const ticketWhere = { ...statsWhere, status: 'OPEN' as const }
  
  const ticketsPromise = prisma.ticket.findMany({
    where: ticketWhere,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        }
      },
      assignments: assignmentInclude,
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      _count: {
        select: {
          messages: true
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    },
    take: 3
  })

  // Filtrar estadísticas según el rol
  
  const range = monthlyRange()
  const [tickets, byStatus, entered, closed] = await Promise.all([
    ticketsPromise,
    prisma.ticket.groupBy({by:['status'],where:statsWhere,_count:{_all:true}}),
    prisma.ticket.count({ where: { enteredById: user.id, createdAt: { gte: range.gte, lt: range.lt } } }),
    prisma.ticket.count({ where: { closedById: user.id, status: 'CLOSED', closedAt: { gte: range.gte, lt: range.lt } } }),
  ])
  const stats = ['OPEN','PENDING','SOLVED','CLOSED'].map(status=>byStatus.find(row=>row.status===status)?._count._all||0)
  stats.push(stats.reduce((sum,count)=>sum+count,0))

  return (
    <>
      
      
      <div className="h-full flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">{user.role === 'CUSTOMER' ? 'Todos mis tickets' : 'Todos los tickets asignados a mí'}</p>
          </div>

          <div className={`mb-6 grid items-stretch gap-5 ${user.role !== 'CUSTOMER' ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : ''}`}>
          <StatsCards
            stats={{
              open: stats[0],
              pending: stats[1],
              closed: stats[2] + stats[3],
              total: stats[4],
            }}
          />

          {user.role !== 'CUSTOMER' && <PerformanceCard month={range.label} name={user.name || user.email || 'Usuario'} avatar={user.avatar} entered={entered} closed={closed} entryGoal={user.dailyEntryGoal} closureGoal={user.dailyClosureGoal} />}
          </div>
          <TicketList tickets={tickets} currentUserId={session?.user?.id} />
        </div>
      </div></>
  )
}
