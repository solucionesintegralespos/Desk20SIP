import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError } from '@/lib/accounting/server'
import { loadCompanyProfile, companyLogo } from '@/lib/accounting/company'

export const dynamic = 'force-dynamic'

// Company identity, logo, billing issuer and the current user (quote signer) for the live previews rendered in the browser.
export async function GET() {
  try {
    const user = await accountingUser()
    const [profile, issuer] = await Promise.all([loadCompanyProfile(), prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true, jobTitle: true, phone: true } })])
    const logo = await companyLogo(profile.logoUrl)
    return Response.json({
      company: {
        name: profile.name, nit: profile.nit, phone: profile.phone, email: profile.email, website: profile.website, address: profile.address, city: profile.city,
        paymentInfo: profile.billingPaymentInfo, legalNote: profile.billingLegalNote, quoteConditions: profile.quoteConditions, billingDueDays: profile.billingDueDays,
      },
      billing: { name: profile.billingName, taxId: profile.billingTaxId, phone: profile.phone, email: profile.email, city: profile.city, paymentInfo: profile.billingPaymentInfo, legalNote: profile.billingLegalNote, dueDays: profile.billingDueDays },
      issuer: issuer ? { id: issuer.id, name: issuer.name || issuer.email || 'Usuario', jobTitle: issuer.jobTitle, email: issuer.email, phone: issuer.phone } : null,
      logo: logo || null,
    })
  } catch (error) { return serviceError(error) }
}
