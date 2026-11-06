import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError } from '@/lib/accounting/server'
import { ACCOUNTING_ROLES } from '@/lib/roles'

export const dynamic = 'force-dynamic'

// Users who can create quotes and billing accounts, for the "created by" filters.
export async function GET() {
  try {
    await accountingUser()
    const users = await prisma.user.findMany({ where: { role: { in: ACCOUNTING_ROLES } }, select: { id: true, name: true, email: true, active: true }, orderBy: [{ name: 'asc' }, { email: 'asc' }] })
    return Response.json(users.map(user => ({ id: user.id, name: user.name || user.email || 'Usuario', email: user.email, active: user.active })))
  } catch (error) { return serviceError(error) }
}
