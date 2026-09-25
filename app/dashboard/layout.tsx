import { redirect } from 'next/navigation'
import { getDashboardUser } from '@/lib/dashboard-data'
import { prisma } from '@/lib/prisma'
import Sidebar from '@/components/dashboard/Sidebar'
import { ThemeProvider } from '@/components/ThemeProvider'

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
  const preference = await prisma.setting.findUnique({ where: { key: `user:${user.id}:theme` }, select: { value: true } })
  return <ThemeProvider key={user.id} initialTheme={preference?.value === 'dark' ? 'dark' : 'light'}><div className="flex h-screen bg-gray-50 flex-col md:flex-row">
    <Sidebar user={{name:user.name,email:user.email,role:user.role}} openTicketsCount={openTicketsCount} />
    <main className="flex-1 min-w-0 min-h-0 overflow-hidden">{children}</main>
  </div></ThemeProvider>
}
