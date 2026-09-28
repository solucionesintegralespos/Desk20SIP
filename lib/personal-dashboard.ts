import type { Prisma } from '@prisma/client'

// Tickets that belong to the user: their own as a customer, or assigned to them as staff.
// Without a range every date is included.
export function personalDashboardWhere(user: { id: string; role: string }, range?: { gte: Date; lt: Date }): Prisma.TicketWhereInput {
  return {
    ...(range ? { createdAt: { gte: range.gte, lt: range.lt } } : {}),
    ...(user.role === 'CUSTOMER'
      ? { customerId: user.id }
      : { OR: [
          { assignments: { some: { userId: user.id } } },
          { assignments: { none: {} }, assigneeId: user.id },
        ] }),
  }
}
