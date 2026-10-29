import { validateAssignees, assignmentInclude } from '@/lib/ticket-assignees'
import { assignedNames } from '@/lib/assigned-names'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phone: true,
            location: true,
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
        messages: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                role: true,
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    })

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket no encontrado' },
        { status: 404 }
      )
    }

    // Si es CUSTOMER, validar que solo pueda ver sus propios tickets
    if (user.role === 'CUSTOMER' && ticket.customerId !== user.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      )
    }

    return NextResponse.json(ticket)
  } catch (error) {
    console.error('Error fetching ticket:', error)
    return NextResponse.json(
      { error: 'Error al obtener ticket' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const actor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
    const current = await prisma.ticket.findUnique({ where: { id: params.id }, include: { assignments: true } })
    if (!current) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
    if (!actor || actor.role === 'CUSTOMER') return NextResponse.json({ error: 'Solo los usuarios internos pueden modificar tickets' }, { status: 403 })
    const body = await request.json()
    const allowed = ['subject', 'description', 'status', 'priority', 'type', 'categoryId', 'hours', 'tags', 'attachments', 'assigneeId', 'assigneeIds']
    if (Object.keys(body).some(key => !allowed.includes(key))) return NextResponse.json({ error: 'Campo no permitido' }, { status: 400 })
    const isChangingAssignees = 'assigneeIds' in body || 'assigneeId' in body
    if (isChangingAssignees && actor.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Solo los administradores pueden cambiar los usuarios asignados' }, { status: 403 })
    }
    for (const [key, values] of Object.entries({ status: ['OPEN', 'PENDING', 'CLOSED'], priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], type: ['INCIDENT', 'CHANGE_REQUEST', 'PROJECT'] })) {
      if (key in body && !values.includes(body[key])) return NextResponse.json({ error: 'Valor inválido: ' + key }, { status: 400 })
    }
    if ('categoryId' in body && (typeof body.categoryId !== 'string' || !body.categoryId || !await prisma.category.findUnique({ where: { id: body.categoryId } }))) return NextResponse.json({ error: 'Selecciona una categoría válida' }, { status: 400 })
    if ('subject' in body && (typeof body.subject !== 'string' || !body.subject.trim())) return NextResponse.json({ error: 'El asunto es requerido' }, { status: 400 })
    if ('hours' in body && body.hours !== null && (typeof body.hours !== 'number' || !Number.isFinite(body.hours) || body.hours < 0)) return NextResponse.json({ error: 'Horas inválidas' }, { status: 400 })
    if (['tags', 'attachments'].some(key => key in body && (!Array.isArray(body[key]) || body[key].some((v: unknown) => typeof v !== 'string')))) return NextResponse.json({ error: 'Lista inválida' }, { status: 400 })
    let ids: string[] | undefined
    try {
      if ('assigneeIds' in body) ids = await validateAssignees(body.assigneeIds)
      else if ('assigneeId' in body) ids = await validateAssignees(body.assigneeId ? [...current.assignments.map(a => a.userId), body.assigneeId] : [])
    } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }) }
    const { assigneeIds, assigneeId, ...data } = body
    const ticket = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${params.id} FOR UPDATE`
      const previous = await tx.ticket.findUniqueOrThrow({
        where: { id: params.id },
        select: {
          status: true,
          assignments: assignmentInclude,
          assignee: { select: { id: true, name: true, email: true } }
        }
      })
      // The legacy take-ticket action adds a technician without replacing the existing team.
      const selected = ids && !('assigneeIds' in body) ? Array.from(new Set([...previous.assignments.map(a => a.userId), ...ids])) : ids
      let assignmentLogMessage: string | null = null
      if (selected) {
        const prevUserIds = previous.assignments.map(a => a.user.id).sort()
        const nextUserIds = [...selected].sort()
        const hasAssignmentChanged = prevUserIds.length !== nextUserIds.length ||
          prevUserIds.some((id, idx) => id !== nextUserIds[idx])

        if (hasAssignmentChanged) {
          const beforeNames = assignedNames(previous)
          const newUsers = await tx.user.findMany({
            where: { id: { in: selected } },
            select: { id: true, name: true, email: true }
          })
          const userMap = new Map(newUsers.map(u => [u.id, u.name || u.email || 'Técnico']))
          const afterNames = selected.map(id => userMap.get(id) || 'Técnico').join(', ') || 'Sin asignar'
          assignmentLogMessage = `Usuarios asignados cambiados. Antes: ${beforeNames} | Después: ${afterNames}`
        }
      }
      if (selected) await tx.ticketAssignee.deleteMany({ where: { ticketId: params.id, userId: { notIn: selected } } })
      const updated = await tx.ticket.update({ where: { id: params.id }, data: { ...data,
        ...(body.status && body.status !== previous.status ? { closedById: body.status === 'CLOSED' ? session.user.id : null, closedAt: body.status === 'CLOSED' ? new Date() : null } : {}),
        ...(selected ? { assigneeId: selected[0], assignments: { createMany: { data: selected.map(userId => ({ userId })), skipDuplicates: true } } } : {}) },
        include: { customer: { select: { id: true, name: true, email: true, avatar: true } }, assignee: { select: { id: true, name: true, email: true } }, assignments: assignmentInclude } })
      if (body.status && previous.status !== body.status) await tx.message.create({ data: { ticketId: params.id, authorId: session.user.id, content: 'Estado cambiado de ' + previous.status + ' a ' + body.status, type: 'SYSTEM', isInternal: false, attachments: [] } })
      if (assignmentLogMessage) await tx.message.create({ data: { ticketId: params.id, authorId: session.user.id, content: assignmentLogMessage, type: 'SYSTEM', isInternal: false, attachments: [] } })
      return updated
    })
    return NextResponse.json(ticket)
  } catch (error) {
    console.error('Error updating ticket:', error)
    return NextResponse.json({ error: 'Error al actualizar ticket' }, { status: 500 })
  }
}
