import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { brandLogo } from '@/lib/order-email'
import type { DocCompany, PdfLogo } from './pdf-brand'

// Company identity printed on quotes and billing accounts. Everything is configured in
// Configuración > Información General; nothing is hard-coded except the reference wording
// of the conditions and the legal note, which administrators can edit.
export interface CompanyProfile extends DocCompany {
  /** Short organization name used across the app (sidebar, emails). */
  orgName: string
  logoUrl: string
  quoteConditions: string
  /** Issuer of the cuentas de cobro; falls back to the company identity. */
  billingName: string
  billingTaxId: string
  billingPaymentInfo: string
  billingLegalNote: string
  billingDueDays: number
}

import { COMPANY_DEFAULTS, COMPANY_SETTING_KEYS } from './company-defaults'
export { COMPANY_DEFAULTS, COMPANY_SETTING_KEYS, type CompanySettingKey } from './company-defaults'

type Db = Pick<Prisma.TransactionClient, 'setting'>
export async function loadCompanyProfile(db: Db = prisma): Promise<CompanyProfile> {
  let values: Record<string, string> = {}
  try {
    const settings = await db.setting.findMany({ where: { key: { in: [...COMPANY_SETTING_KEYS] } }, select: { key: true, value: true } })
    values = Object.fromEntries(settings.map(setting => [setting.key, setting.value]))
  } catch { /* Documents still render with the defaults when settings are unavailable. */ }
  const get = (key: keyof typeof COMPANY_DEFAULTS) => (values[key] ?? '').trim() || COMPANY_DEFAULTS[key]
  const dueDays = parseInt(get('billing_due_days'), 10)
  const orgName = get('org_name')
  // Documents print the legal name (razón social); the short name is the fallback.
  const name = get('org_business_name') || orgName
  const nit = get('org_nit')
  return {
    name, orgName, nit, phone: get('org_phone'), email: get('org_email'), website: get('org_website'),
    address: get('org_address'), city: get('org_city'), logoUrl: (values.org_logo ?? '').trim(),
    quoteConditions: get('quote_conditions'), billingName: get('billing_name') || name, billingTaxId: get('billing_tax_id') || nit,
    billingPaymentInfo: get('billing_payment_info'), billingLegalNote: get('billing_legal_note'),
    billingDueDays: Number.isInteger(dueDays) && dueDays >= 0 && dueDays <= 365 ? dueDays : 30,
  }
}

/** The configured logo as a data URL for jsPDF, on the server and in the browser preview. */
export async function companyLogo(logoUrl: string): Promise<PdfLogo | undefined> {
  const logo = await brandLogo(logoUrl)
  if (!logo) return undefined
  return { dataUrl: `data:${logo.contentType};base64,${logo.data.toString('base64')}`, format: logo.format }
}

export const docCompany = (profile: CompanyProfile): DocCompany => ({ name: profile.name, nit: profile.nit, phone: profile.phone, email: profile.email, website: profile.website, address: profile.address, city: profile.city })
