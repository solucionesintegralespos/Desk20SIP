import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, pdfResponse } from '@/lib/accounting/server'
import { billingPdfBuffer, billingFileName } from '@/lib/accounting/billing'

export const dynamic = 'force-dynamic'

// Same PDF that was stored at issue time, served to staff (download or inline preview).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await accountingUser()
    const account = await prisma.billingAccount.findUnique({ where: { id: params.id }, select: { id: true, number: true, status: true, snapshot: true, pdf: true, customer: { select: { name: true, businessName: true, email: true } } } })
    if (!account) throw new ServiceError('Cuenta de cobro no encontrada', 404)
    const disposition = new URL(request.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
    const customerName = account.customer.businessName || account.customer.name || account.customer.email || ''
    return pdfResponse(await billingPdfBuffer(account), billingFileName(account, customerName), disposition)
  } catch (error) {
    console.error(`[BILLING_PDF] account_id=${params.id}`, error)
    return serviceError(error)
  }
}
