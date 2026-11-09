import { prisma } from '@/lib/prisma'
import { staffUser, serviceError } from '@/lib/accounting/server'
import { loanAge } from '@/lib/inventory/stock'
import { loanNumberLabel } from '@/lib/inventory/loans'

export const dynamic = 'force-dynamic'

// Availability report: warehouse stock vs. units out on loan, per product, with loan ages.
export async function GET() {
  try {
    await staffUser()
    const [products, openLoans] = await Promise.all([
      prisma.product.findMany({ where: { OR: [{ active: true }, { loans: { some: {} } }] }, select: { id: true, name: true, stock: true, active: true }, orderBy: { name: 'asc' } }),
      prisma.equipmentLoan.findMany({ where: { status: 'OUT' }, include: {
        customer: { select: { id: true, name: true, email: true, businessName: true } },
        technician: { select: { id: true, name: true, email: true } },
      }, orderBy: { outAt: 'asc' } }),
    ])
    const now = new Date()
    const byProduct = new Map<string, typeof openLoans>()
    for (const loan of openLoans) byProduct.set(loan.productId, [...(byProduct.get(loan.productId) || []), loan])
    const rows = products.map(product => {
      const loans = byProduct.get(product.id) || []
      return {
        id: product.id, name: product.name, active: product.active, stock: product.stock,
        loanedUnits: loans.reduce((sum, loan) => sum + loan.quantity, 0),
        openLoans: loans.map(loan => { const age = loanAge(loan.outAt, now); return {
          id: loan.id, numberLabel: loanNumberLabel(loan.number), quantity: loan.quantity, outAt: loan.outAt.toISOString(), days: age.days, ageLabel: age.label,
          customer: { id: loan.customer.id, name: loan.customer.businessName || loan.customer.name || loan.customer.email || 'Cliente' },
          technician: { id: loan.technician.id, name: loan.technician.name || loan.technician.email || 'Técnico' },
        } }),
      }
    })
    const totals = {
      products: rows.length,
      available: rows.reduce((sum, row) => sum + row.stock, 0),
      loaned: rows.reduce((sum, row) => sum + row.loanedUnits, 0),
      oldestDays: openLoans.length ? loanAge(openLoans[0].outAt, now).days : 0,
    }
    return Response.json({ products: rows, totals, generatedAt: now.toISOString() })
  } catch (error) { return serviceError(error) }
}
