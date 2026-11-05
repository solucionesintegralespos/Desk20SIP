import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { serializeQuote, quoteInclude, quoteSchema, updateQuote } from '@/lib/accounting/quotes'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await accountingUser()
    const quote = await prisma.quote.findUnique({ where: { id: params.id }, include: quoteInclude })
    if (!quote) throw new ServiceError('Cotización no encontrada', 404)
    return Response.json(serializeQuote(quote))
  } catch (error) { return serviceError(error) }
}

// Edits an issued quote in place: same number, new content and totals.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    const parsed = quoteSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const updated = await updateQuote(params.id, parsed.data, user.id)
    const quote = await prisma.quote.findUnique({ where: { id: updated.id }, include: quoteInclude })
    if (!quote) throw new ServiceError('No se pudo leer la cotización actualizada', 503)
    return Response.json(serializeQuote(quote))
  } catch (error) { return serviceError(error) }
}
