import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { staffUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { loanOutSchema, issueLoan } from '@/lib/inventory/stock'
import { loanInclude, serializeLoan } from '@/lib/inventory/loans'
import { STAFF_ROLES } from '@/lib/roles'

export const dynamic = 'force-dynamic'
const PER_PAGE = 20

export async function GET(request: Request) {
  try {
    await staffUser()
    const params = new URL(request.url).searchParams
    const status = params.get('status') || 'OUT'
    const product = (params.get('product') || '').trim(), customer = (params.get('customer') || '').trim(), technician = (params.get('technician') || '').trim()
    const q = (params.get('q') || '').trim().slice(0, 100)
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
    const where: Prisma.EquipmentLoanWhereInput = {
      ...(status === 'OUT' || status === 'RETURNED' ? { status } : {}),
      ...(product ? { productId: product } : {}), ...(customer ? { customerId: customer } : {}), ...(technician ? { technicianId: technician } : {}),
    }
    if (q) {
      const digits = q.replace(/^pr-?/i, '').replace(/^0+/, '')
      where.OR = [
        ...(/^\d{1,9}$/.test(digits) ? [{ number: parseInt(digits, 10) }] : []),
        { product: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { businessName: { contains: q, mode: 'insensitive' } }] } },
        { technician: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }
    const [loans, total, technicians, products] = await Promise.all([
      prisma.equipmentLoan.findMany({ where, include: loanInclude, orderBy: [{ status: 'asc' }, { outAt: 'desc' }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
      prisma.equipmentLoan.count({ where }),
      prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
      prisma.product.findMany({ where: { active: true, loanable: true }, select: { id: true, name: true, stock: true, active: true }, orderBy: { name: 'asc' } }),
    ])
    return Response.json({
      loans: loans.map(serializeLoan), total, page, perPage: PER_PAGE,
      technicians: technicians.map(user => ({ id: user.id, name: user.name || user.email || 'Técnico' })),
      products,
    })
  } catch (error) { return serviceError(error) }
}

// Exit of equipment: the loan is opened and the stock discounted in one transaction.
export async function POST(request: Request) {
  try {
    const user = await staffUser()
    const parsed = loanOutSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const created = await prisma.$transaction(tx => issueLoan(tx, parsed.data, user.id))
    const loan = await prisma.equipmentLoan.findUniqueOrThrow({ where: { id: created.id }, include: loanInclude })
    return Response.json(serializeLoan(loan), { status: 201 })
  } catch (error) { return serviceError(error) }
}
