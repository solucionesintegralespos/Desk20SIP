type Assigned = {
  assignments?: Array<{ user: { name: string | null; email: string | null } }>
  assignee?: { name: string | null; email: string | null } | null
}
export function assignedList(ticket: Assigned) {
  const users = ticket.assignments?.length ? ticket.assignments.map(a => a.user) : ticket.assignee ? [ticket.assignee] : []
  return users.map(user => user.name || user.email || 'Técnico')
}
export function assignedNames(ticket: Assigned) {
  return assignedList(ticket).join(', ') || 'Sin asignar'
}
// One line for lists: the first names and "+N"; the full list goes in a tooltip.
export function assignedSummary(ticket: Assigned, shown = 2) {
  const names = assignedList(ticket)
  return { text: names.slice(0, shown).join(', ') || 'Sin asignar', more: Math.max(0, names.length - shown), all: names.join(', ') }
}
