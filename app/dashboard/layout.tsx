import { redirect } from 'next/navigation'
import { getDashboardUser } from '@/lib/dashboard-data'
import { prisma } from '@/lib/prisma'
import Sidebar from '@/components/dashboard/Sidebar'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TaskReminders } from '@/components/reminders/TaskReminders'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getDashboardUser()
  if (!user) {
    redirect('/login')
  }

  const openTicketsCount = await prisma.ticket.count({
    where: { status: 'OPEN', ...(user.role === 'CUSTOMER' ? {customerId:user.id} : {}) },
  })
  // The theme is a device preference read from localStorage by ThemeProvider.
  const workspace = <div className="flex h-screen bg-gray-50 flex-col md:flex-row">
    <Sidebar user={{name:user.name,email:user.email,role:user.role}} openTicketsCount={openTicketsCount} />
    <main className="flex-1 min-w-0 min-h-0 overflow-hidden">{children}</main>
  </div>
  // Scheduled tasks belong to support staff only.
  return <ThemeProvider>{user.role === 'CUSTOMER' ? workspace : <TaskReminders userId={user.id}>{workspace}</TaskReminders>}</ThemeProvider>
}
