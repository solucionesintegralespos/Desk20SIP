import { getDashboardUser } from '@/lib/dashboard-data'
import { redirect } from 'next/navigation'
import Incentives from '@/components/incentives/Incentives'

export default async function IncentivesPage() {
  const user = await getDashboardUser()
  if (!user) redirect('/login')
  if (user.role !== 'ADMIN') redirect('/dashboard')
  return <Incentives />
}
