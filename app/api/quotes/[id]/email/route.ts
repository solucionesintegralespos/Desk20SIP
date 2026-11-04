import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError } from '@/lib/accounting/server'
import { sendQuoteEmail } from '@/lib/accounting/email'

export const dynamic = 'force-dynamic'

// Sends the quote PDF to the customer's registered email. The result is always 200:
// `status` (sent | skipped | failed) tells the screen what to show.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    const exists = await prisma.quote.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!exists) throw new ServiceError('Cotización no encontrada', 404)
    const email = await sendQuoteEmail(params.id, user.id)
    return Response.json({ email })
  } catch (error) { return serviceError(error) }
}
