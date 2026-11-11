import { prisma } from '@/lib/prisma'
import { staffUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { loanReturnSchema, returnLoan } from '@/lib/inventory/stock'
import { loanInclude, serializeLoan } from '@/lib/inventory/loans'

export const dynamic = 'force-dynamic'

// Return of equipment: always against an open exit order (equipment, units, customer and technician are inherited
// from it); closes the order and restores the stock of every piece of equipment.
export async function POST(request: Request) {
  try {
    const user = await staffUser()
    const parsed = loanReturnSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const returned = await prisma.$transaction(tx => returnLoan(tx, parsed.data, user.id))
    const loan = await prisma.equipmentLoan.findUniqueOrThrow({ where: { id: returned.id }, include: loanInclude })
    return Response.json(serializeLoan(loan))
  } catch (error) { return serviceError(error) }
}
