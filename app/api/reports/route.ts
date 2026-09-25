import { NextResponse } from 'next/server'
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
    const [entries, closures, open, pending] = await Promise.all([
      prisma.ticket.findMany({ where: { ...categoryWhere, createdAt: period, ...(technician ? { enteredById: technician } : {}) }, select: { enteredById: true, createdAt: true, categoryId: true } }),
      prisma.ticket.findMany({ where: { ...categoryWhere, status: 'CLOSED', closedAt: period, ...(technician ? { closedById: technician } : {}) }, select: { closedById: true, closedAt: true } }),
      prisma.ticket.count({ where: { ...categoryWhere, ...assigned, status: 'OPEN' } }),
      prisma.ticket.count({ where: { ...categoryWhere, ...assigned, status: 'PENDING' } }),
    ])
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
    return NextResponse.json({ month, label: range.label, technician, category, technicians, categories,
      summary: { entered: entries.length, closed: closures.length, open, pending },
      unattributed: entries.filter(t => !t.enteredById).length,
      rows: technicians.filter(t => !technician || t.id === technician).map(t => ({ id: t.id, name: t.name || t.email || 'Usuario', avatar: t.avatar, entered: entryCounts.get(t.id) || 0, closed: closureCounts.get(t.id) || 0, entryGoal: t.dailyEntryGoal, closureGoal: t.dailyClosureGoal })),
      activity,
      byCategory: Array.from(categoryCounts, ([id, count]) => ({ name: categories.find(c => c.id === id)?.name || 'Sin categoría', count })).sort((a,b) => b.count - a.count),
    })
  } catch (error) {
    console.error('Error fetching reports:', error)
    return NextResponse.json({ error: 'No se pudo cargar el reporte' }, { status: 500 })
  }
}
