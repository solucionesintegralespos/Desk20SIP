import { assignmentInclude } from '@/lib/ticket-assignees'
import { getDashboardSession, getDashboardUser } from "@/lib/dashboard-data"
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import TicketHeader from '@/components/tickets/TicketHeader'
import MessageList from '@/components/tickets/MessageList'
import MessageForm from '@/components/tickets/MessageForm'
import TicketSidebar from '@/components/tickets/TicketSidebar'

export default async function TicketDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/login')
  }

  // Obtener usuario completo con su rol
  const user = await getDashboardUser()

  if (!user) {
    redirect('/login')
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
          createdAt: true,
        }
      },
      category: {
        select: {
          id: true,
          name: true,
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
      },
      interactions: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  })

  if (!ticket) {
    notFound()
  }

  // Si es CUSTOMER, validar que solo pueda ver sus propios tickets
  if (user.role === 'CUSTOMER' && ticket.customerId !== user.id) {
    redirect('/dashboard')
  }

  // Filtrar contador según el rol
  const countWhere = user.role === 'CUSTOMER' 
    ? { status: 'OPEN' as const, customerId: user.id }
    : { status: 'OPEN' as const }
  

  return (
    <>
      
      
      <div className="h-full flex-1 flex overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <TicketHeader ticket={ticket} />
          
          <div className="flex-1 overflow-y-auto p-6">
            <MessageList 
              ticket={ticket}
              messages={ticket.messages}
              currentUserId={session.user.id}
            />
          </div>

          <MessageForm 
            ticketId={ticket.id}
            currentUserId={session.user.id}
          />
        </div>

        {/* Right sidebar */}
        <TicketSidebar 
          ticket={ticket}
          interactions={ticket.interactions}
        />
      </div></>
  )
}
