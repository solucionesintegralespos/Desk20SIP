import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { dailyRange } from '@/lib/daily-filter'
import { accountingUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { occasionalSchema, issueBillingAccount, serializeAccount } from '@/lib/accounting/billing'
import { toCents } from '@/lib/accounting/format'
import { accountSelect } from '@/lib/accounting/billing-select'

export const dynamic = 'force-dynamic'
const PER_PAGE = 20

export async function GET(request: Request) {
  try {
    await accountingUser()
    const params = new URL(request.url).searchParams
    const q = (params.get('q') || '').trim().slice(0, 100)
    const customer = params.get('customer') || ''
    const status = params.get('status') || ''
    const from = params.get('from') || '', to = params.get('to') || ''
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
    const where: Prisma.BillingAccountWhereInput = {
      ...(customer ? { customerId: customer } : {}),
      ...(status === 'ISSUED' || status === 'VOID' ? { status } : {}),
    }
    if (from || to) { const range = dailyRange(from, to); where.issuedAt = { gte: range.gte, lt: range.lt } }
    if (q) {
      const digits = q.replace(/^#/, '')
      where.OR = [
        ...(/^\d{1,9}$/.test(digits) ? [{ number: parseInt(digits, 10) }] : []),
        { concept: { contains: q, mode: 'insensitive' } },
        { customer: { OR: [
          { name: { contains: q, mode: 'insensitive' } }, { businessName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }, { taxId: { contains: q, mode: 'insensitive' } },
        ] } },
      ]
    }
    // Totals cover every account matching the filters, not only the current page.
    const [accounts, total, issued, voided] = await Promise.all([
      prisma.billingAccount.findMany({ where, select: accountSelect, orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
      prisma.billingAccount.count({ where }),
      prisma.billingAccount.aggregate({ where: { ...where, status: 'ISSUED' }, _sum: { total: true }, _count: { _all: true } }),
      prisma.billingAccount.aggregate({ where: { ...where, status: 'VOID' }, _sum: { total: true }, _count: { _all: true } }),
    ])
    const totals = {
      count: total, issuedCount: issued._count._all, voidCount: voided._count._all,
      issuedCents: Math.round(Number(issued._sum.total ?? 0) * 100), voidCents: Math.round(Number(voided._sum.total ?? 0) * 100),
    }
    return Response.json({ accounts: accounts.map(serializeAccount), total, page, perPage: PER_PAGE, totals })
  } catch (error) { return serviceError(error) }
}

export async function POST(request: Request) {
  try {
    const user = await accountingUser()
    const parsed = occasionalSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const issued = await issueBillingAccount({ customerId: parsed.data.customerId, concept: parsed.data.concept, totalCents: toCents(parsed.data.total), actorId: user.id })
    const account = await prisma.billingAccount.findUniqueOrThrow({ where: { id: issued.id }, select: accountSelect })
    return Response.json(serializeAccount(account), { status: 201 })
  } catch (error) { return serviceError(error) }
}
