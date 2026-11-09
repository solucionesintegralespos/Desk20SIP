import { redirect } from 'next/navigation'
import { getDashboardUser } from '@/lib/dashboard-data'
import { isStaff } from '@/lib/roles'

/** Server wrapper for staff screens (agents, accounting and administrators). */
export default async function StaffPage({ children }: { children: React.ReactNode }) {
  const user = await getDashboardUser()
  if (!user) redirect('/login')
  if (!isStaff(user.role)) redirect('/dashboard')
  return <div className="h-full flex-1 overflow-y-auto"><div className="p-4 md:p-8">{children}</div></div>
}
