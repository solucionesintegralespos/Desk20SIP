import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { monthlyRange } from '@/lib/monthly-performance'
import { serviceDay } from '@/lib/support/order-display'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const actor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
    if (actor?.role !== 'ADMIN') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    const params = new URL(request.url).searchParams
    const month = params.get('month') || serviceDay(new Date().toISOString()).slice(0, 7)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0,4)) < 2000) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
    const range = monthlyRange(new Date(`${month}-01T12:00:00-05:00`))
    const technician = params.get('technician') || ''
    const category = params.get('category') || ''
    const [technicians, categories] = await Promise.all([
      prisma.user.findMany({ where: { role: { in: ['ADMIN', 'AGENT'] } }, select: { id: true, name: true, email: true, avatar: true, dailyEntryGoal: true, dailyClosureGoal: true }, orderBy: { name: 'asc' } }),
      prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    if ((technician && !technicians.some(t => t.id === technician)) || (category && !categories.some(c => c.id === category))) return NextResponse.json({ error: 'Filtro inválido' }, { status: 400 })
    const categoryWhere = category ? { categoryId: category } : {}
    const period = { gte: range.gte, lt: range.lt }
    const assigned = technician ? { OR: [{ assignments: { some: { userId: technician } } }, { assignments: { none: {} }, assigneeId: technician }] } : {}
    // Tickets created per month over the last six years (Bogotá calendar), same filters as "digitados".
    const currentYear = Number(serviceDay(new Date().toISOString()).slice(0, 4)), firstYear = currentYear - 5
    const localCreated = Prisma.sql`("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')`
    const monthlyQuery = prisma.$queryRaw<{ year: number; month: number; count: number }[]>`
      SELECT EXTRACT(YEAR FROM ${localCreated})::int AS year, EXTRACT(MONTH FROM ${localCreated})::int AS month, COUNT(*)::int AS count
      FROM "Ticket"
      WHERE ${localCreated} >= make_timestamp(${firstYear}::int, 1, 1, 0, 0, 0)
        ${category ? Prisma.sql`AND "categoryId" = ${category}` : Prisma.empty}
        ${technician ? Prisma.sql`AND "enteredById" = ${technician}` : Prisma.empty}
      GROUP BY 1, 2`
    const [entries, closures, open, pending, monthlyRows] = await Promise.all([
      prisma.ticket.findMany({ where: { ...categoryWhere, createdAt: period, ...(technician ? { enteredById: technician } : {}) }, select: { enteredById: true, createdAt: true, categoryId: true, customerId: true, status: true } }),
      prisma.ticket.findMany({ where: { ...categoryWhere, status: 'CLOSED', closedAt: period, ...(technician ? { closedById: technician } : {}) }, select: { closedById: true, closedAt: true } }),
      prisma.ticket.count({ where: { ...categoryWhere, ...assigned, status: 'OPEN' } }),
      prisma.ticket.count({ where: { ...categoryWhere, ...assigned, status: 'PENDING' } }),
      monthlyQuery,
    ])
    const years = Array.from(new Set([...monthlyRows.map(r => r.year), currentYear])).sort((a, b) => a - b)
    const currentMonth = Number(serviceDay(new Date().toISOString()).slice(5, 7))
    // Months that have not happened yet are null so the current year's line stops at today.
    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...Object.fromEntries(years.map(year => [year,
      year === currentYear && i + 1 > currentMonth ? null : monthlyRows.find(r => r.year === year && r.month === i + 1)?.count || 0])) }))
    const activity = Array.from({ length: Math.round((range.lt.getTime() - range.gte.getTime()) / 86400000) }, (_, i) => ({ day: String(i + 1), entered: 0, closed: 0 }))
    const entryCounts = new Map<string, number>(), closureCounts = new Map<string, number>(), categoryCounts = new Map<string, number>()
    for (const t of entries) {
      activity[Number(serviceDay(t.createdAt.toISOString()).slice(-2)) - 1].entered++
      if (t.enteredById) entryCounts.set(t.enteredById, (entryCounts.get(t.enteredById) || 0) + 1)
      categoryCounts.set(t.categoryId || '', (categoryCounts.get(t.categoryId || '') || 0) + 1)
    }
    for (const t of closures) {
      activity[Number(serviceDay(t.closedAt!.toISOString()).slice(-2)) - 1].closed++
      if (t.closedById) closureCounts.set(t.closedById, (closureCounts.get(t.closedById) || 0) + 1)
    }
    // Tickets created in the month per client, split by their current status.
    const clientCounts = new Map<string, { total: number; open: number; pending: number; closed: number }>()
    for (const t of entries) {
      const row = clientCounts.get(t.customerId) || { total: 0, open: 0, pending: 0, closed: 0 }
      row.total++
      if (t.status === 'OPEN') row.open++; else if (t.status === 'PENDING') row.pending++; else row.closed++
      clientCounts.set(t.customerId, row)
    }
    const clientNames = clientCounts.size ? await prisma.user.findMany({ where: { id: { in: Array.from(clientCounts.keys()) } }, select: { id: true, name: true, email: true } }) : []
    const byClient = Array.from(clientCounts, ([id, counts]) => {
      const client = clientNames.find(c => c.id === id)
      return { id, name: client?.name || client?.email || 'Cliente', email: client?.name ? client.email : null, ...counts }
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
    return NextResponse.json({ month, label: range.label, byClient, technician, category, technicians, categories,
      summary: { entered: entries.length, closed: closures.length, open, pending },
      unattributed: entries.filter(t => !t.enteredById).length,
      rows: technicians.filter(t => !technician || t.id === technician).map(t => ({ id: t.id, name: t.name || t.email || 'Usuario', avatar: t.avatar, entered: entryCounts.get(t.id) || 0, closed: closureCounts.get(t.id) || 0, entryGoal: t.dailyEntryGoal, closureGoal: t.dailyClosureGoal })),
      activity,
      monthly: { years, rows: monthly },
      byCategory: Array.from(categoryCounts, ([id, count]) => ({ name: categories.find(c => c.id === id)?.name || 'Sin categoría', count })).sort((a,b) => b.count - a.count),
    })
  } catch (error) {
    console.error('Error fetching reports:', error)
    return NextResponse.json({ error: 'No se pudo cargar el reporte' }, { status: 500 })
  }
}
