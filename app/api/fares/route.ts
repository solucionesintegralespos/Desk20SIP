import { prisma } from '@/lib/prisma'
import { staffUser, serviceError } from '@/lib/accounting/server'
import { getFaresPaidUntil } from '@/lib/fares'
import { fareRows, parseFareRange } from '@/lib/fares-report'
import { STAFF_ROLES } from '@/lib/roles'

export const dynamic = 'force-dynamic'

// Fares (pasajes) of the schedule events in a date range, with totals by status.
export async function GET(request: Request) {
  try {
    await staffUser()
    const { from, to, tech } = parseFareRange(new URL(request.url).searchParams)
    const [rows, paidUntil, technicians] = await Promise.all([
      fareRows(from, to, tech), getFaresPaidUntil(),
      prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
    ])
    const sum = (status?: string) => rows.filter(row => !status || row.status === status).reduce((total, row) => total + row.amountCents, 0)
    return Response.json({
      from, to, paidUntil, fares: rows,
      totals: { count: rows.length, totalCents: sum(), pendingCents: sum('pending'), acceptedCents: sum('accepted'), paidCents: sum('paid') },
      technicians: technicians.map(person => ({ id: person.id, name: person.name || person.email || 'Sin nombre' })),
    })
  } catch (error) { return serviceError(error) }
}
