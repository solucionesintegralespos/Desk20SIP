import { accountingUser, serviceError } from '@/lib/accounting/server'
import { loadCompanyProfile, companyLogo } from '@/lib/accounting/company'

export const dynamic = 'force-dynamic'

// Company identity and logo for the live previews rendered in the browser.
export async function GET() {
  try {
    await accountingUser()
    const profile = await loadCompanyProfile()
    const logo = await companyLogo(profile.logoUrl)
    return Response.json({
      company: {
        name: profile.name, nit: profile.nit, phone: profile.phone, email: profile.email, website: profile.website, address: profile.address, city: profile.city,
        paymentInfo: profile.billingPaymentInfo, legalNote: profile.billingLegalNote, quoteConditions: profile.quoteConditions, billingDueDays: profile.billingDueDays,
      },
      logo: logo || null,
    })
  } catch (error) { return serviceError(error) }
}
