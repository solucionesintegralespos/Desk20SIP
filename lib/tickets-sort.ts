// Sorting of the ticket list lives in the URL (`sort` and `dir`) so it survives
// pagination, links back to the list and the browser history.
export const ticketSortKeys = ['number', 'customer', 'type', 'category', 'status', 'priority', 'assignee', 'updated'] as const
export type TicketSortKey = typeof ticketSortKeys[number]
export type TicketSortDir = 'asc' | 'desc'

export const defaultTicketSort: { key: TicketSortKey; dir: TicketSortDir } = { key: 'updated', dir: 'desc' }

export function parseTicketSort(sort?: string, dir?: string) {
  const key = ticketSortKeys.includes(sort as TicketSortKey) ? sort as TicketSortKey : defaultTicketSort.key
  const direction: TicketSortDir = dir === 'asc' || dir === 'desc' ? dir : key === defaultTicketSort.key ? defaultTicketSort.dir : 'asc'
  return { key, dir: direction }
}

/** Prisma `orderBy` for the list; the update date breaks ties so pages stay stable. */
export function ticketOrderBy(sort: { key: TicketSortKey; dir: TicketSortDir }) {
  const { key, dir } = sort
  const primary = {
    number: { number: dir },
    customer: { customer: { name: dir } },
    type: { type: { sort: dir, nulls: 'last' as const } },
    category: { category: { name: dir } },
    status: { status: dir },
    priority: { priority: dir },
    assignee: { assignee: { name: dir } },
    updated: { updatedAt: dir },
  }[key]
  return key === 'updated' ? [primary] : [primary, { updatedAt: 'desc' as const }]
}
