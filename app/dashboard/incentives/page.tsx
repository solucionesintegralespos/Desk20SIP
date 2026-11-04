import { getDashboardUser } from '@/lib/dashboard-data'
import { redirect } from 'next/navigation'
import Incentives from '@/components/incentives/Incentives'
import { isAdmin } from '@/lib/roles'

export default async function IncentivesPage() {
  const user = await getDashboardUser()
  if (!user) redirect('/login')
  if (!isAdmin(user.role)) redirect('/dashboard')
  return <Incentives />
}
