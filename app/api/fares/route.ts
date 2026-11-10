import { prisma } from '@/lib/prisma'
import { staffUser, serviceError } from '@/lib/accounting/server'
import { canUseAccounting, STAFF_ROLES } from '@/lib/roles'
import { getFaresPaidUntil } from '@/lib/fares'
import { fareRows, parseFareRange } from '@/lib/fares-report'

export const dynamic = 'force-dynamic'

// Fares (pasajes) of the schedule events in a date range, with totals by status.
// Administration and accounting see everyone and manage the fares; agents only see their own, read-only.
export async function GET(request: Request) {
  try {
    const user = await staffUser()
    const canManage = canUseAccounting(user.role)
    const range = parseFareRange(new URL(request.url).searchParams)
    const { from, to } = range
    const tech = canManage ? range.tech : user.id
    const [rows, paidUntil, technicians] = await Promise.all([
      fareRows(from, to, tech), getFaresPaidUntil(),
      canManage ? prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }) : [],
    ])
    const sum = (status?: string) => rows.filter(row => !status || row.status === status).reduce((total, row) => total + row.amountCents, 0)
    return Response.json({
      from, to, paidUntil, canManage, fares: rows,
      totals: { count: rows.length, totalCents: sum(), pendingCents: sum('pending'), acceptedCents: sum('accepted'), paidCents: sum('paid') },
      technicians: technicians.map(person => ({ id: person.id, name: person.name || person.email || 'Sin nombre' })),
    })
  } catch (error) { return serviceError(error) }
}
