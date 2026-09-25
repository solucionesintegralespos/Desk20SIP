import type { Prisma } from '@prisma/client'
import { dailyRange } from './daily-filter'

export function personalDashboardWhere(user: { id: string; role: string }, date?: string): Prisma.TicketWhereInput {
  const range = dailyRange(date)
  return {
    createdAt: { gte: range.gte, lt: range.lt },
    ...(user.role === 'CUSTOMER'
      ? { customerId: user.id }
      : { OR: [
          { assignments: { some: { userId: user.id } } },
          { assignments: { none: {} }, assigneeId: user.id },
        ] }),
  }
}
