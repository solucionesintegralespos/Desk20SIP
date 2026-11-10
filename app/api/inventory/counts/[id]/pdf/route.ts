import { staffUser, serviceError, ServiceError, pdfResponse } from '@/lib/accounting/server'
import { loadCompanyProfile, companyLogo, docCompany } from '@/lib/accounting/company'
import { getBulkCount, shortCountId } from '@/lib/inventory/counts'
import { countPdf } from '@/lib/inventory/count-pdf'

export const dynamic = 'force-dynamic'

// PDF of a stored count: theoretical, physical and difference per product.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await staffUser()
    const report = await getBulkCount(params.id)
    if (!report) throw new ServiceError('Conteo no encontrado', 404)
    const profile = await loadCompanyProfile()
    const logo = await companyLogo(profile.logoUrl)
    const pdf = await countPdf({ company: docCompany(profile), logo, ...report })
    const disposition = new URL(request.url).searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline'
    return pdfResponse(pdf, `conteo-${shortCountId(report.id)}.pdf`, disposition)
  } catch (error) { return serviceError(error) }
}
