import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson, audit } from '@/lib/accounting/server'
import { newPublicToken, publicBillingUrl } from '@/lib/accounting/billing'

export const dynamic = 'force-dynamic'

// Public link management: regenerate invalidates the previous token at once.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    const body = await readJson(request)
    const action = body?.action
    if (!['regenerate', 'disable', 'enable'].includes(action)) throw new ServiceError('Operación inválida')
    const account = await prisma.$transaction(async tx => {
      const existing = await tx.billingAccount.findUnique({ where: { id: params.id }, select: { id: true } })
      if (!existing) throw new ServiceError('Cuenta de cobro no encontrada', 404)
      const updated = await tx.billingAccount.update({
        where: { id: params.id },
        data: action === 'regenerate' ? { publicToken: newPublicToken(), publicEnabled: true } : { publicEnabled: action === 'enable' },
        select: { publicToken: true, publicEnabled: true },
      })
      await audit(tx, user.id, params.id, `billing:link-${action === 'regenerate' ? 'regenerated' : action + 'd'}`)
      return updated
    })
    return Response.json({ publicEnabled: account.publicEnabled, publicUrl: account.publicEnabled ? publicBillingUrl(account.publicToken) : null })
  } catch (error) { return serviceError(error) }
}
