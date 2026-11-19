import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson, audit } from '@/lib/accounting/server'
import { serializeAccount, editSchema, paySchema, editBillingAccount, payBillingAccount, unpayBillingAccount } from '@/lib/accounting/billing'
import { accountSelect } from '@/lib/accounting/billing-select'
import { toCents } from '@/lib/accounting/format'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await accountingUser()
    const account = await prisma.billingAccount.findUnique({ where: { id: params.id }, select: accountSelect })
    if (!account) throw new ServiceError('Cuenta de cobro no encontrada', 404)
    return Response.json(serializeAccount(account))
  } catch (error) { return serviceError(error) }
}

// Actions on one account: void (keeps the number: numbers are never reused), edit (concept/total of an
// issued account), pay (with date and note) and unpay. Paid accounts are frozen until the payment is undone.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    const body = await readJson(request)
    const action = body?.action
    if (action === 'void') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
      await prisma.$transaction(async tx => {
        const existing = await tx.billingAccount.findUnique({ where: { id: params.id }, select: { id: true, status: true } })
        if (!existing) throw new ServiceError('Cuenta de cobro no encontrada', 404)
        if (existing.status === 'VOID') throw new ServiceError('La cuenta ya está anulada', 409)
        if (existing.status === 'PAID') throw new ServiceError('Una cuenta pagada no se puede anular. Deshaz el pago primero.', 409)
        await tx.billingAccount.update({ where: { id: params.id }, data: { status: 'VOID', voidedAt: new Date(), voidReason: reason || null } })
        await audit(tx, user.id, params.id, 'billing:voided')
      })
    } else if (action === 'edit') {
      const parsed = editSchema.safeParse(body)
      if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
      await editBillingAccount(params.id, { concept: parsed.data.concept, totalCents: parsed.data.total !== undefined ? toCents(parsed.data.total) : undefined }, user.id)
    } else if (action === 'pay') {
      const parsed = paySchema.safeParse(body)
      if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
      await payBillingAccount(params.id, parsed.data, user.id)
    } else if (action === 'unpay') {
      await unpayBillingAccount(params.id, user.id)
    } else throw new ServiceError('Operación inválida')
    const account = await prisma.billingAccount.findUniqueOrThrow({ where: { id: params.id }, select: accountSelect })
    return Response.json(serializeAccount(account))
  } catch (error) { return serviceError(error) }
}
