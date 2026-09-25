import { cache } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Deduplicate authentication and public profile reads within one render only.
// Never share authenticated data between requests or users.
export const getDashboardSession = cache(() => getServerSession(authOptions))
export const getDashboardUser = cache(async () => {
  const session = await getDashboardSession()
  if (!session) return null
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, avatar: true,
      phone: true, location: true, address: true, createdAt: true, dailyEntryGoal: true, dailyClosureGoal: true,
      twoFactorEnabled: true, emailNotifications: true },
  })
})
