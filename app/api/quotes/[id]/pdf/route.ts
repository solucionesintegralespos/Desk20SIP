import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, pdfResponse } from '@/lib/accounting/server'
import { quoteInclude, quotePdfBuffer, quoteFileName } from '@/lib/accounting/quotes'

export const dynamic = 'force-dynamic'

// Same PDF that the email attaches; `disposition=inline` embeds it in the detail preview.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await accountingUser()
    const quote = await prisma.quote.findUnique({ where: { id: params.id }, include: quoteInclude })
    if (!quote) throw new ServiceError('Cotización no encontrada', 404)
    const disposition = new URL(request.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
    return pdfResponse(await quotePdfBuffer(quote), quoteFileName(quote), disposition)
  } catch (error) {
    console.error(`[QUOTE_PDF] quote_id=${params.id}`, error)
    return serviceError(error)
  }
}
