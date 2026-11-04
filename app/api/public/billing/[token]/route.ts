import { prisma } from '@/lib/prisma'
import { pdfResponse } from '@/lib/accounting/server'
import { billingPdfBuffer, billingFileName } from '@/lib/accounting/billing'

export const dynamic = 'force-dynamic'

// Public view of a cuenta de cobro: only the random token identifies it, never an id.
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const token = params.token || ''
  const invalid = () => Response.json({ error: 'El enlace no es válido o fue desactivado' }, { status: 404, headers: { 'X-Robots-Tag': 'noindex' } })
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return invalid()
  try {
    const account = await prisma.billingAccount.findUnique({ where: { publicToken: token }, select: { id: true, number: true, status: true, snapshot: true, pdf: true, publicEnabled: true } })
    if (!account || !account.publicEnabled) return invalid()
    return pdfResponse(await billingPdfBuffer(account), billingFileName(account), 'inline')
  } catch (error) {
    console.error('[BILLING_PUBLIC] no se pudo generar el documento', error)
    return Response.json({ error: 'No se pudo generar el documento' }, { status: 503 })
  }
}
