import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { staffUser, serviceError, decimal } from '@/lib/accounting/server'
import { canWriteOffInventory } from '@/lib/roles'

export const dynamic = 'force-dynamic'

// Stock per product. `stock` already excludes the units lent out (LOAN_OUT discounts it);
// `loaned` is the sum of open loans and `total` the units the company owns.
export async function GET(request: Request) {
  try {
    const user = await staffUser()
    const params = new URL(request.url).searchParams
    const q = (params.get('q') || '').trim().slice(0, 100)
    const onlyActive = params.get('active') === '1'
    const where: Prisma.ProductWhereInput = {
      ...(onlyActive ? { active: true } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}),
    }
    const [products, loans, lastMovements] = await Promise.all([
      prisma.product.findMany({ where, select: { id: true, name: true, description: true, price: true, active: true, stock: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      prisma.equipmentLoanItem.groupBy({ by: ['productId'], where: { loan: { status: 'OUT' } }, _sum: { quantity: true } }),
      prisma.inventoryMovement.groupBy({ by: ['productId'], _max: { createdAt: true } }),
    ])
    const loanedBy = new Map(loans.map(loan => [loan.productId, loan._sum.quantity ?? 0]))
    const lastBy = new Map(lastMovements.map(entry => [entry.productId, entry._max.createdAt]))
    const rows = products.map(product => {
      const loaned = loanedBy.get(product.id) ?? 0
      return {
        id: product.id, name: product.name, description: product.description, price: decimal(product.price) ?? 0, active: product.active,
        stock: product.stock, loaned, available: product.stock, total: product.stock + loaned,
        lastMovementAt: lastBy.get(product.id)?.toISOString() ?? null,
      }
    })
    const totals = { products: rows.length, units: rows.reduce((sum, row) => sum + row.stock, 0), loaned: rows.reduce((sum, row) => sum + row.loaned, 0) }
    return Response.json({ products: rows, totals, permissions: { writeOff: canWriteOffInventory(user) } })
  } catch (error) { return serviceError(error) }
}
