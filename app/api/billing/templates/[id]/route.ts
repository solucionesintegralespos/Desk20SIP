import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson, audit, fromCentsDecimal } from '@/lib/accounting/server'
import { serializeTemplate } from '@/lib/accounting/billing'
import { toCents } from '@/lib/accounting/format'

export const dynamic = 'force-dynamic'
const customerSelect = { id: true, name: true, email: true, businessName: true, taxId: true }
const patchSchema = z.object({
  customerId: z.string().min(1).max(100).optional(),
  concept: z.string().trim().min(1, 'Describe el producto o concepto').max(500).optional(),
  total: z.number().finite().min(0).max(99999999999).optional(),
  active: z.boolean().optional(),
})

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await accountingUser()
    const template = await prisma.billingTemplate.findUnique({
      where: { id: params.id },
      include: { customer: { select: customerSelect }, _count: { select: { accounts: true } }, accounts: { select: { id: true, number: true, period: true, status: true, issuedAt: true }, orderBy: { issuedAt: 'desc' } } },
    })
    if (!template) throw new ServiceError('Plantilla no encontrada', 404)
    return Response.json(serializeTemplate(template))
  } catch (error) { return serviceError(error) }
}

// Edits apply only to accounts generated afterwards; issued documents keep their snapshot.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    const parsed = patchSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const input = parsed.data
    const template = await prisma.$transaction(async tx => {
      const existing = await tx.billingTemplate.findUnique({ where: { id: params.id }, include: { _count: { select: { accounts: true } } } })
      if (!existing) throw new ServiceError('Plantilla no encontrada', 404)
      if (input.customerId && input.customerId !== existing.customerId) {
        if (existing._count.accounts > 0) throw new ServiceError('No se puede cambiar el cliente de una plantilla con cuentas generadas', 409)
        const customer = await tx.user.findFirst({ where: { id: input.customerId, role: 'CUSTOMER' }, select: { id: true } })
        if (!customer) throw new ServiceError('Selecciona un cliente válido')
      }
      const data: Prisma.BillingTemplateUpdateInput = {}
      if (input.customerId && input.customerId !== existing.customerId) data.customer = { connect: { id: input.customerId } }
      if (input.concept !== undefined) data.concept = input.concept
      if (input.total !== undefined) data.total = fromCentsDecimal(toCents(input.total))
      if (input.active !== undefined) data.active = input.active
      const updated = await tx.billingTemplate.update({ where: { id: params.id }, data, include: { customer: { select: customerSelect }, _count: { select: { accounts: true } } } })
      const action = input.active !== undefined && input.active !== existing.active ? (input.active ? 'activated' : 'deactivated') : 'updated'
      await audit(tx, user.id, params.id, `billing-templates:${action}`)
      return updated
    })
    return Response.json(serializeTemplate(template))
  } catch (error) { return serviceError(error) }
}
