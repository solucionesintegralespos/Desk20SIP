import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, getTicketReplyEmailTemplate } from '@/lib/email'

const STAFF_TYPES = ['COMMENT', 'NOTE', 'EMAIL', 'WHATSAPP'] as const

// Staff work on every ticket; a customer only on their own, and never sees internal notes.
async function ticketAccess(ticketId: unknown, userId: string) {
  if (typeof ticketId !== 'string' || !ticketId) return null
  const [user, ticket] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, customerId: true } }),
  ])
  if (!user || !ticket) return null
  if (user.role === 'CUSTOMER' && ticket.customerId !== userId) return null
  return { staff: user.role !== 'CUSTOMER', ticket }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const { ticketId, content, isInternal, type, attachments } = await request.json()

    if (typeof content !== 'string' || !content.trim() || content.length > 20000) {
      return NextResponse.json(
        { error: 'Datos incompletos' },
        { status: 400 }
      )
    }
    if (attachments !== undefined && (!Array.isArray(attachments) || attachments.length > 20 || attachments.some(a => typeof a !== 'string' || !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(a)))) {
      return NextResponse.json({ error: 'Adjuntos inválidos' }, { status: 400 })
    }

    const access = await ticketAccess(ticketId, session.user.id)
    // Same answer for a missing ticket and someone else's ticket.
    if (!access) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
    // Customers write public comments only; system messages come from the server itself.
    const internal = access.staff && isInternal === true
    const messageType = access.staff && STAFF_TYPES.includes(type) ? type : 'COMMENT'

    const message = await prisma.message.create({
      data: {
        content,
        isInternal: internal,
        type: messageType,
        ticketId: access.ticket.id,
        authorId: session.user.id,
        attachments: attachments || [],
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          }
        },
        ticket: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                emailNotifications: true,
              }
            }
          }
        }
      }
    })

    // Update ticket's updatedAt
    await prisma.ticket.update({
      where: { id: access.ticket.id },
      data: { updatedAt: new Date() }
    })

    // Enviar email al cliente si no es mensaje interno y el cliente tiene notificaciones activadas
    if (!internal && message.ticket.customer.emailNotifications && message.author.role !== 'CUSTOMER') {
      const emailTemplate = getTicketReplyEmailTemplate({
        customerName: message.ticket.customer.name || message.ticket.customer.email,
        ticketNumber: message.ticket.number,
        subject: message.ticket.subject,
        replyContent: content,
        agentName: message.author.name || message.author.email || "Soporte",
      })

      await sendEmail({
        to: message.ticket.customer.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
      })
    }

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json(
      { error: 'Error al crear mensaje' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const ticketId = searchParams.get('ticketId')

    if (!ticketId) {
      return NextResponse.json(
        { error: 'ticketId es requerido' },
        { status: 400 }
      )
    }

    const access = await ticketAccess(ticketId, session.user.id)
    if (!access) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

    const messages = await prisma.message.findMany({
      where: { ticketId, ...(access.staff ? {} : { isInternal: false }) },
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
    })

    return NextResponse.json(messages)
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Error al obtener mensajes' },
      { status: 500 }
    )
  }
}
