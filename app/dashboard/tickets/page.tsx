import { assignmentInclude } from '@/lib/ticket-assignees'
import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import TicketsTable from '@/components/tickets/TicketsTable'
import CreateTicketButton from '@/components/tickets/CreateTicketButton'
import TicketFilters from '@/components/tickets/TicketFilters'
import Pagination from '@/components/tickets/Pagination'
import { dailyRange } from '@/lib/daily-filter'
import { personalDashboardWhere } from '@/lib/personal-dashboard'

interface SearchParams {
  status?: string
  priority?: string
  assignee?: string
  search?: string
  category?: string
  date?: string
  page?: string
  mine?: string
}

export default async function TicketsPage({
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

  const page = parseInt(searchParams.page || '1')
  const perPage = 20
  const skip = (page - 1) * perPage

  const whereClause: any = searchParams.mine === '1' ? personalDashboardWhere(user, searchParams.date) : {}
  
  // Si es CUSTOMER, solo puede ver sus propios tickets
  if (user.role === 'CUSTOMER') {
    whereClause.customerId = user.id
  }
  
  if (searchParams.status) {
    whereClause.status = ['SOLVED', 'CLOSED'].includes(searchParams.status) ? { in: ['SOLVED', 'CLOSED'] } : searchParams.status
  }
  
  if (searchParams.priority) {
    whereClause.priority = searchParams.priority
  }
  
  if (searchParams.assignee) {
    if (searchParams.assignee === 'unassigned') {
      whereClause.assignments = { none: {} }
    } else {
      whereClause.assignments = { some: { userId: searchParams.assignee } }
    }
  }

  if (searchParams.search) {
    whereClause.subject = {
      contains: searchParams.search,
      mode: 'insensitive'
    }
  }

  if (searchParams.category) {
    whereClause.categoryId = searchParams.category === 'uncategorized' ? null : searchParams.category
  }

  const range = dailyRange(searchParams.date)
  whereClause.createdAt = { gte: range.gte, lt: range.lt }

  const [tickets, totalCount, agents, categories] = await Promise.all([
    prisma.ticket.findMany({
      where: whereClause,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          }
        },
        category: {
          select: {
            id: true,
            name: true,
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
      skip,
      take: perPage,
    }),
    prisma.ticket.count({ where: whereClause }),
    prisma.user.findMany({
      where: {
        role: {
          in: ['AGENT', 'ADMIN']
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
      }
    }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <>
      
      
      <div className="h-full flex-1 overflow-y-auto">
        <div className="p-4 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tickets</h1>
              <p className="text-gray-600 mt-1">Gestiona todos los tickets de soporte</p>
            </div>
            <CreateTicketButton />
          </div>

          <TicketFilters 
            currentStatus={searchParams.status === 'SOLVED' ? 'CLOSED' : searchParams.status}
            currentPriority={searchParams.priority}
            currentAssignee={searchParams.assignee}
            currentSearch={searchParams.search}
            currentCategory={searchParams.category}
            currentDate={range.dateFrom}
            categories={categories}
            agents={agents}
          />

          <TicketsTable 
            tickets={tickets}
            agents={agents}
            currentUserId={session.user.id}
          />

          <Pagination 
            currentPage={page}
            totalPages={Math.ceil(totalCount / perPage)}
            totalCount={totalCount}
          />
        </div>
      </div></>
  )
}
