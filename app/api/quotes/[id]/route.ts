import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError } from '@/lib/accounting/server'
import { serializeQuote, quoteInclude } from '@/lib/accounting/quotes'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await accountingUser()
    const quote = await prisma.quote.findUnique({ where: { id: params.id }, include: quoteInclude })
    if (!quote) throw new ServiceError('Cotización no encontrada', 404)
    return Response.json(serializeQuote(quote))
  } catch (error) { return serviceError(error) }
}
