import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson, audit, fromCentsDecimal } from '@/lib/accounting/server'
import { templateSchema, serializeTemplate } from '@/lib/accounting/billing'
import { currentPeriod, isPeriod, toCents, formatBillingNumber } from '@/lib/accounting/format'

export const dynamic = 'force-dynamic'
const customerSelect = { id: true, name: true, email: true, businessName: true, taxId: true }

// Recurring templates with their account for the requested period (one query).
export async function GET(request: Request) {
  try {
    await accountingUser()
    const params = new URL(request.url).searchParams
    const requested = params.get('period') || ''
    const period = isPeriod(requested) ? requested : currentPeriod()
    const customer = params.get('customer') || ''
    const active = params.get('active')
    const where: Prisma.BillingTemplateWhereInput = {
      ...(customer ? { customerId: customer } : {}),
      ...(active === '1' || active === 'true' ? { active: true } : active === '0' || active === 'false' ? { active: false } : {}),
    }
    const templates = await prisma.billingTemplate.findMany({
      where, orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: { customer: { select: customerSelect }, _count: { select: { accounts: true } }, accounts: { where: { period }, select: { id: true, number: true, period: true, status: true, issuedAt: true }, take: 1 } },
    })
    return Response.json({ period, templates: templates.map(template => {
      const generated = template.accounts[0]
      const { accounts: _accounts, ...rest } = serializeTemplate(template)
      return { ...rest, generated: generated ? { id: generated.id, numberLabel: formatBillingNumber(generated.number), issuedAt: generated.issuedAt.toISOString(), status: generated.status } : null }
    }) })
  } catch (error) { return serviceError(error) }
}

export async function POST(request: Request) {
  try {
    const user = await accountingUser()
    const parsed = templateSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const customer = await prisma.user.findFirst({ where: { id: parsed.data.customerId, role: 'CUSTOMER' }, select: { id: true } })
    if (!customer) throw new ServiceError('Selecciona un cliente válido')
    const template = await prisma.$transaction(async tx => {
      const created = await tx.billingTemplate.create({
        data: { customerId: customer.id, concept: parsed.data.concept, total: fromCentsDecimal(toCents(parsed.data.total)), frequency: parsed.data.frequency, active: parsed.data.active, createdById: user.id },
        include: { customer: { select: customerSelect }, _count: { select: { accounts: true } } },
      })
      await audit(tx, user.id, created.id, 'billing-templates:created')
      return created
    })
    return Response.json(serializeTemplate(template), { status: 201 })
  } catch (error) { return serviceError(error) }
}
