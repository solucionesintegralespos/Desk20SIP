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
import { parseTicketSort, ticketOrderBy } from '@/lib/tickets-sort'

interface SearchParams {
  status?: string
  priority?: string
  assignee?: string
  search?: string
  category?: string
  customer?: string
  date?: string
  from?: string
  to?: string
  range?: string
  page?: string
  mine?: string
  number?: string
  sort?: string
  dir?: string
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

  const sort = parseTicketSort(searchParams.sort, searchParams.dir)

  // Exact ticket number ("123" or "#123"). It is exclusive: every other filter,
  // including the date range and the personal list, is ignored so the ticket always
  // shows up. Only the role restriction below still applies.
  const numberText = (searchParams.number || '').trim().replace(/^#/, '')
  const ticketNumber = /^[0-9]{1,9}$/.test(numberText) ? parseInt(numberText, 10) : undefined
  const filters: SearchParams = ticketNumber === undefined ? searchParams : { number: numberText }

  const whereClause: any = filters.mine === '1' ? personalDashboardWhere(user) : {}
  if (ticketNumber !== undefined) whereClause.number = ticketNumber
  
  // Si es CUSTOMER, solo puede ver sus propios tickets
  if (user.role === 'CUSTOMER') {
    whereClause.customerId = user.id
  }
  
  if (filters.status) {
    whereClause.status = ['SOLVED', 'CLOSED'].includes(filters.status) ? { in: ['SOLVED', 'CLOSED'] } : filters.status
  }
  
  if (filters.priority) {
    whereClause.priority = filters.priority
  }
  
  if (filters.assignee) {
    if (filters.assignee === 'unassigned') {
      whereClause.assignments = { none: {} }
    } else {
      whereClause.assignments = { some: { userId: filters.assignee } }
    }
  }

  if (filters.search) {
    whereClause.subject = {
      contains: filters.search,
      mode: 'insensitive'
    }
  }

  if (filters.category) {
    whereClause.categoryId = filters.category === 'uncategorized' ? null : filters.category
  }

  // Customers only ever see their own tickets, so the client filter is for staff.
  if (filters.customer && user.role !== 'CUSTOMER') {
    whereClause.customerId = filters.customer
  }

  // Creation date range in Colombia (from/to, inclusive). Without dates the list shows today;
  // range=all removes the date filter. `date` is the former single-day parameter.
  const allDates = filters.range === 'all'
  const range = dailyRange(filters.from || filters.date, filters.to || filters.date)
  if (!allDates && ticketNumber === undefined) whereClause.createdAt = { gte: range.gte, lt: range.lt }
  const dateFiltered = allDates || !!(filters.from || filters.to || filters.date)

  const [tickets, totalCount, agents, categories, customers] = await Promise.all([
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
      orderBy: ticketOrderBy(sort),
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
    user.role === 'CUSTOMER' ? Promise.resolve([]) : prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true, name: true, email: true },
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
            currentStatus={filters.status === 'SOLVED' ? 'CLOSED' : filters.status}
            currentPriority={filters.priority}
            currentAssignee={filters.assignee}
            currentSearch={filters.search}
            currentNumber={ticketNumber !== undefined ? String(ticketNumber) : undefined}
            currentCategory={filters.category}
            currentCustomer={user.role === 'CUSTOMER' ? undefined : filters.customer}
            customers={customers}
            currentFrom={allDates ? '' : range.dateFrom}
            currentTo={allDates ? '' : range.dateTo}
            dateFiltered={dateFiltered}
            categories={categories}
            agents={agents}
          />

          <TicketsTable 
            tickets={tickets}
            agents={agents}
            currentUserId={session.user.id}
            sort={sort}
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
