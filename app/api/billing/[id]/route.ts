import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson, audit } from '@/lib/accounting/server'
import { serializeAccount } from '@/lib/accounting/billing'
import { accountSelect } from '@/lib/accounting/billing-select'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await accountingUser()
    const account = await prisma.billingAccount.findUnique({ where: { id: params.id }, select: accountSelect })
    if (!account) throw new ServiceError('Cuenta de cobro no encontrada', 404)
    return Response.json(serializeAccount(account))
  } catch (error) { return serviceError(error) }
}

// Voiding keeps the document and its number: numbers are never reused.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    const body = await readJson(request)
    if (body?.action !== 'void') throw new ServiceError('Operación inválida')
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    const account = await prisma.$transaction(async tx => {
      const existing = await tx.billingAccount.findUnique({ where: { id: params.id }, select: { id: true, status: true } })
      if (!existing) throw new ServiceError('Cuenta de cobro no encontrada', 404)
      if (existing.status === 'VOID') throw new ServiceError('La cuenta ya está anulada', 409)
      const updated = await tx.billingAccount.update({ where: { id: params.id }, data: { status: 'VOID', voidedAt: new Date(), voidReason: reason || null }, select: accountSelect })
      await audit(tx, user.id, params.id, 'billing:voided')
      return updated
    })
    return Response.json(serializeAccount(account))
  } catch (error) { return serviceError(error) }
}
