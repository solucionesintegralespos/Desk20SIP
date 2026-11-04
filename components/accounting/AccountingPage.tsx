import { redirect } from 'next/navigation'
import { getDashboardUser } from '@/lib/dashboard-data'
import { canUseAccounting } from '@/lib/roles'

/** Server wrapper for the accounting screens: administrators and Contabilidad only. */
export default async function AccountingPage({ children }: { children: React.ReactNode }) {
  const user = await getDashboardUser()
  if (!user) redirect('/login')
  if (!canUseAccounting(user.role)) redirect('/dashboard')
  return <div className="h-full flex-1 overflow-y-auto"><div className="p-4 md:p-8">{children}</div></div>
}
