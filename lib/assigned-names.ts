export function assignedNames(ticket: {
  assignments?: Array<{ user: { name: string | null; email: string | null } }>
  assignee?: { name: string | null; email: string | null } | null
}) {
  const users = ticket.assignments?.length ? ticket.assignments.map(a => a.user) : ticket.assignee ? [ticket.assignee] : []
  return users.map(user => user.name || user.email).join(', ') || 'Sin asignar'
}
