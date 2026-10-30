import { validateAssignees } from '@/lib/ticket-assignees'
import { dailyRange } from '@/lib/daily-filter'
import { assignmentInclude } from '@/lib/ticket-assignees'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, getTicketCreatedEmailTemplate } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Obtener usuario con su rol
    const user = await prisma.user.findUnique({
      where: { email: session.user.email || '' },
      select: { id: true, role: true }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const range = dailyRange(searchParams.get('date'))

    const whereClause: any = {
      createdAt: { gte: range.gte, lt: range.lt },
      ...(status && { status: ['SOLVED', 'CLOSED'].includes(status) ? { in: ['SOLVED', 'CLOSED'] } : status }),
      ...(priority && { priority: priority as any }),
    }

    // Si es CUSTOMER, solo puede ver sus propios tickets
    if (user.role === 'CUSTOMER') {
      whereClause.customerId = user.id
    }

    const tickets = await prisma.ticket.findMany({
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
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return NextResponse.json(tickets)
  } catch (error: any) {
    if (error?.digest === 'DYNAMIC_SERVER_USAGE') throw error
    console.error('Error fetching tickets:', error)
    return NextResponse.json(
      { error: 'Error al obtener tickets' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const { subject, description, priority, type, categoryId, hours, tags, attachments } = body
    let customerId = body.customerId || session?.user.id
    if (!session) {
      if (!body.publicToken || typeof body.publicToken !== 'string') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
      const customer = await prisma.user.findUnique({ where: { publicToken: body.publicToken }, select: { id: true, role: true } })
      if (!customer || customer.role !== 'CUSTOMER') return NextResponse.json({ error: 'Enlace no válido' }, { status: 403 })
      customerId = customer.id
    } else {
      const actor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
      if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
      if (actor.role === 'CUSTOMER') customerId = session.user.id
    }
    if (typeof subject !== 'string' || !subject.trim()) return NextResponse.json({ error: 'El asunto es requerido' }, { status: 400 })
    if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) return NextResponse.json({ error: 'Selecciona una prioridad válida' }, { status: 400 })
    if (!['INCIDENT', 'CHANGE_REQUEST', 'PROJECT'].includes(type)) return NextResponse.json({ error: 'Selecciona un tipo válido' }, { status: 400 })
    if (typeof categoryId !== 'string' || !categoryId || !await prisma.category.findUnique({ where: { id: categoryId } })) return NextResponse.json({ error: 'Selecciona una categoría válida' }, { status: 400 })
    let assigneeIds: string[]
    try { assigneeIds = await validateAssignees(body.assigneeIds ?? (body.assigneeId ? [body.assigneeId] : [])) }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }) }
    if (typeof customerId !== 'string' || !await prisma.user.findUnique({ where: { id: customerId } })) return NextResponse.json({ error: 'Selecciona un cliente válido' }, { status: 400 })
    const estimatedHours = hours === null || hours === undefined || hours === '' ? null : Number(hours)
    if (estimatedHours !== null && (!Number.isFinite(estimatedHours) || estimatedHours < 0)) return NextResponse.json({ error: 'Las horas deben ser un número positivo' }, { status: 400 })
    if ((description != null && typeof description !== 'string') || [tags, attachments].some(value => value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== 'string')))) return NextResponse.json({ error: 'Datos del ticket no válidos' }, { status: 400 })
    const ticket = await prisma.ticket.create({
      data: {
        subject: subject.trim(), description, priority, type, categoryId, customerId, hours: estimatedHours, enteredById: session?.user.id || null,
        tags: tags || [], attachments: attachments || [], assigneeId: assigneeIds[0],
        assignments: { createMany: { data: assigneeIds.map(userId => ({ userId })), skipDuplicates: true } }
      },
      include: { customer: { select: { id: true, name: true, email: true, avatar: true, emailNotifications: true } }, assignments: assignmentInclude }
    })
    if (ticket.customer.emailNotifications) {
      try {
        const emailTemplate = getTicketCreatedEmailTemplate({ customerName: ticket.customer.name || ticket.customer.email, ticketNumber: ticket.number, subject: ticket.subject, description: ticket.description || '' })
        await sendEmail({ to: ticket.customer.email, subject: emailTemplate.subject, html: emailTemplate.html })
      } catch (error) { console.error('Ticket creado; no se pudo enviar la notificación', error) }
    }
    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    console.error('Error creating ticket:', error)
    return NextResponse.json({ error: 'Error al crear ticket' }, { status: 500 })
  }
}
