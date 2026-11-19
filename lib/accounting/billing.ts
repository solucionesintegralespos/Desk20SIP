import { randomBytes } from 'crypto'
import { Prisma, type BillingAccount, type BillingTemplate } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ServiceError, audit, cents, fromCentsDecimal, publicBaseUrl } from './server'
import { loadCompanyProfile, companyLogo, docCompany, type CompanyProfile } from './company'
import { billingPdf, type BillingDocument } from './billing-pdf'
import { amountInWords } from './number-words'
import { currentPeriod, formatBillingNumber, isPeriod } from './format'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const money = z.number().finite().min(0).max(99999999999)
export const occasionalSchema = z.object({
  customerId: z.string().min(1).max(100),
  concept: z.string().trim().min(1, 'Describe el producto o concepto').max(500),
  total: money,
})
export const templateSchema = z.object({
  customerId: z.string().min(1).max(100),
  concept: z.string().trim().min(1, 'Describe el producto o concepto').max(500),
  total: money,
  frequency: z.literal('MONTHLY').default('MONTHLY'),
  active: z.boolean().default(true),
})
export const generateSchema = z.object({
  templateIds: z.array(z.string().min(1).max(100)).min(1, 'Selecciona al menos una plantilla').max(200),
  period: z.string().refine(isPeriod, 'Período inválido').optional(),
})
// Editing an issued account: concept and/or total (at least one). Number, customer and dates never change.
export const editSchema = z.object({
  concept: z.string().trim().min(1, 'Describe el producto o concepto').max(500).optional(),
  total: money.optional(),
}).refine(value => value.concept !== undefined || value.total !== undefined, 'Indica el concepto o el total a cambiar')
const DATE = /^\d{4}-\d{2}-\d{2}$/
export const paySchema = z.object({
  // Bogotá calendar day of the payment; defaults to today. Never in the future.
  paidAt: z.string().regex(DATE, 'Fecha de pago inválida').optional(),
  note: z.string().trim().max(300).optional(),
})
export const bulkSchema = z.object({
  action: z.enum(['pay', 'edit']),
  ids: z.array(z.string().min(1).max(100)).min(1, 'Selecciona al menos una cuenta').max(200),
  paidAt: z.string().regex(DATE, 'Fecha de pago inválida').optional(),
  note: z.string().trim().max(300).optional(),
  concept: z.string().trim().min(1, 'Describe el producto o concepto').max(500).optional(),
  total: money.optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'edit' && value.concept === undefined && value.total === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Indica el concepto o el total a cambiar' })
})

// ---------------------------------------------------------------------------
// Numbering: one consecutive per customer, reserved inside the issuing transaction.
// ---------------------------------------------------------------------------
type Tx = Prisma.TransactionClient

/**
 * Reserves the next number for a customer. The first call inserts the configured start
 * number; later calls increment the row. PostgreSQL locks the row for the transaction,
 * so concurrent issuers for the same customer serialize and never share a number, and a
 * failed transaction rolls the increment back without leaving a gap in use.
 */
export async function nextBillingNumber(tx: Tx, customerId: string, startNumber: number) {
  const start = Number.isInteger(startNumber) && startNumber >= 1 ? startNumber : 1
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "CustomerBillingSequence" ("customerId", "lastNumber") VALUES (${customerId}, ${start})
    ON CONFLICT ("customerId") DO UPDATE SET "lastNumber" = "CustomerBillingSequence"."lastNumber" + 1
    RETURNING "lastNumber"`
  const number = rows[0]?.lastNumber
  if (!Number.isInteger(number) || number < 1) throw new ServiceError('No se pudo reservar el consecutivo del cliente', 503)
  return number
}

/** Number the next account of a customer would receive (read-only, for the UI). */
export async function peekBillingNumber(customerId: string) {
  const [customer, sequence] = await Promise.all([
    prisma.user.findUnique({ where: { id: customerId }, select: { billingStartNumber: true } }),
    prisma.customerBillingSequence.findUnique({ where: { customerId } }),
  ])
  if (!customer) return null
  return { next: sequence ? sequence.lastNumber + 1 : Math.max(1, customer.billingStartNumber), started: !!sequence }
}

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------
export interface BillingSnapshot {
  customer: { id: string; name: string; businessName: string | null; taxId: string | null; email: string | null; phone: string | null; address: string | null; city: string | null }
  company: { name: string; nit: string; phone: string; email: string; website: string; address: string; city: string; paymentInfo: string; legalNote: string }
  concept: string
  totalCents: number
  amountInWords: string
  period: string | null
  issuedAt: string
  dueAt: string | null
  templateId: string | null
  logoUrl: string
}

export const customerSnapshot = (customer: { id: string; name: string | null; email: string | null; businessName: string | null; taxId: string | null; phone: string | null; address: string | null; location: string | null }) => ({
  id: customer.id, name: customer.name || customer.email || 'Cliente', businessName: customer.businessName || null, taxId: customer.taxId || null,
  email: customer.email || null, phone: customer.phone || null, address: customer.address || null, city: customer.location || null,
})

export const newPublicToken = () => randomBytes(32).toString('base64url')
export const publicBillingUrl = (token: string) => { const base = publicBaseUrl(); return base ? new URL(`/api/public/billing/${encodeURIComponent(token)}`, base).toString() : `/api/public/billing/${encodeURIComponent(token)}` }

export function billingDocument(account: Pick<BillingAccount, 'number' | 'status' | 'snapshot'> & { paidAt?: Date | null }, logo?: BillingDocument['logo']): BillingDocument {
  const snapshot = account.snapshot as unknown as BillingSnapshot
  return {
    company: { ...snapshot.company }, logo, number: formatBillingNumber(account.number), issuedAt: snapshot.issuedAt, dueAt: snapshot.dueAt,
    customer: snapshot.customer, concept: snapshot.concept, totalCents: snapshot.totalCents, amountInWords: snapshot.amountInWords,
    period: snapshot.period, status: account.status, paidAt: account.paidAt ? account.paidAt.toISOString() : null,
  }
}

export interface IssueInput { customerId: string; concept: string; totalCents: number; templateId?: string | null; period?: string | null; actorId: string }

/**
 * Issues one cuenta de cobro: reserves the customer's number, freezes customer and company
 * data, renders the PDF and stores everything in a single transaction. Recurring accounts
 * pass templateId + period; a second account for the same period is rejected (409).
 */
export async function issueBillingAccount(input: IssueInput, profile?: CompanyProfile) {
  const company = profile || await loadCompanyProfile()
  const logo = await companyLogo(company.logoUrl)
  return prisma.$transaction(async tx => {
    const customer = await tx.user.findFirst({ where: { id: input.customerId, role: 'CUSTOMER' }, select: { id: true, name: true, email: true, businessName: true, taxId: true, phone: true, address: true, location: true, billingStartNumber: true } })
    if (!customer) throw new ServiceError('Selecciona un cliente válido', 400)
    if (input.templateId) {
      const template = await tx.billingTemplate.findUnique({ where: { id: input.templateId } })
      if (!template || template.customerId !== customer.id) throw new ServiceError('La plantilla no corresponde al cliente', 400)
      if (!template.active) throw new ServiceError('La plantilla está inactiva', 409)
      const duplicate = await tx.billingAccount.findFirst({ where: { templateId: input.templateId, period: input.period || null }, select: { number: true } })
      if (duplicate) throw new ServiceError(`Ya existe la cuenta ${formatBillingNumber(duplicate.number)} para este período`, 409)
    }
    const number = await nextBillingNumber(tx, customer.id, customer.billingStartNumber)
    const issuedAt = new Date()
    const dueAt = company.billingDueDays > 0 ? new Date(issuedAt.getTime() + company.billingDueDays * 86400000) : null
    const snapshot: BillingSnapshot = {
      customer: customerSnapshot(customer),
      // Cuentas de cobro are issued under the billing identity configured in Settings (name, CC/NIT, transfer details).
      company: { ...docCompany(company), name: company.billingName, nit: company.billingTaxId, paymentInfo: company.billingPaymentInfo, legalNote: company.billingLegalNote },
      concept: input.concept.trim(), totalCents: input.totalCents, amountInWords: amountInWords(input.totalCents),
      period: input.period || null, issuedAt: issuedAt.toISOString(), dueAt: dueAt ? dueAt.toISOString() : null,
      templateId: input.templateId || null, logoUrl: company.logoUrl,
    }
    const pdf = await billingPdf(billingDocument({ number, status: 'ISSUED', snapshot: snapshot as unknown as Prisma.JsonValue }, logo))
    let account: BillingAccount
    try {
      account = await tx.billingAccount.create({ data: {
        customerId: customer.id, number, templateId: input.templateId || null, period: input.period || null,
        concept: snapshot.concept, total: fromCentsDecimal(input.totalCents), snapshot: snapshot as unknown as Prisma.InputJsonValue,
        publicToken: newPublicToken(), pdf: Buffer.from(pdf), issuedAt, dueAt, createdById: input.actorId,
      } })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ServiceError('Otra persona generó esta cuenta al mismo tiempo. Actualiza la lista.', 409)
      throw error
    }
    await audit(tx, input.actorId, account.id, input.templateId ? 'billing:generated' : 'billing:issued')
    return account
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20000 })
}

export interface GenerateResult { templateId: string; customer: string; concept: string; status: 'generated' | 'duplicate' | 'error'; message: string; accountId?: string; number?: string }

/** Generates the selected recurring templates for a period, one transaction each: a failure never blocks the others. */
export async function generateFromTemplates(templateIds: string[], period: string | undefined, actorId: string): Promise<GenerateResult[]> {
  const target = period || currentPeriod()
  const templates = await prisma.billingTemplate.findMany({ where: { id: { in: templateIds } }, include: { customer: { select: { name: true, email: true, businessName: true } } } })
  const company = await loadCompanyProfile()
  const results: GenerateResult[] = []
  for (const id of templateIds) {
    const template = templates.find(t => t.id === id)
    if (!template) { results.push({ templateId: id, customer: '', concept: '', status: 'error', message: 'La plantilla no existe' }); continue }
    const customer = template.customer.businessName || template.customer.name || template.customer.email || 'Cliente'
    const base = { templateId: id, customer, concept: template.concept }
    if (!template.active) { results.push({ ...base, status: 'error', message: 'Plantilla inactiva' }); continue }
    try {
      const account = await issueBillingAccount({ customerId: template.customerId, concept: template.concept, totalCents: cents(template.total), templateId: id, period: target, actorId }, company)
      results.push({ ...base, status: 'generated', message: `Cuenta ${formatBillingNumber(account.number)} generada`, accountId: account.id, number: formatBillingNumber(account.number) })
    } catch (error) {
      const duplicate = error instanceof ServiceError && error.status === 409
      results.push({ ...base, status: duplicate ? 'duplicate' : 'error', message: error instanceof ServiceError ? error.message : 'No se pudo generar la cuenta' })
      if (!(error instanceof ServiceError)) console.error(`[BILLING] template=${id} period=${target}`, error)
    }
  }
  return results
}

/** Stored PDF when available (it is regenerated on edit and payment); voided, older or trimmed rows are rendered again from their snapshot. */
export async function billingPdfBuffer(account: Pick<BillingAccount, 'id' | 'number' | 'status' | 'snapshot' | 'pdf'> & { paidAt?: Date | null }) {
  if (account.pdf && account.status !== 'VOID') return Buffer.from(account.pdf)
  const snapshot = account.snapshot as unknown as BillingSnapshot
  const logo = await companyLogo(snapshot.logoUrl || '')
  return Buffer.from(await billingPdf(billingDocument(account, logo)))
}

// ---------------------------------------------------------------------------
// Editing and payment (individually or in bulk). Paid accounts are frozen: they can neither be
// edited nor voided until the payment is undone. Voided accounts cannot be edited or paid.
// ---------------------------------------------------------------------------
const statusLabel = (status: BillingAccount['status']) => status === 'PAID' ? 'pagada' : status === 'VOID' ? 'anulada' : 'emitida'
const editableOrThrow = (account: Pick<BillingAccount, 'status'>) => {
  if (account.status === 'PAID') throw new ServiceError('Una cuenta pagada no se puede editar. Deshaz el pago si necesitas corregirla.', 409)
  if (account.status === 'VOID') throw new ServiceError('Una cuenta anulada no se puede editar', 409)
}

/** Bogotá calendar day (YYYY-MM-DD) as an instant at noon, so the printed date never shifts a day. */
const dayInstant = (day: string) => new Date(`${day}T12:00:00-05:00`)
export const todayInBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

/** Changes concept and/or total of an issued account, refreshing its snapshot and stored PDF. The number and dates stay. */
export async function editBillingAccount(id: string, changes: z.infer<typeof editSchema> & { totalCents?: number }, actorId: string) {
  return prisma.$transaction(async tx => {
    const account = await tx.billingAccount.findUnique({ where: { id } })
    if (!account) throw new ServiceError('Cuenta de cobro no encontrada', 404)
    editableOrThrow(account)
    const snapshot = account.snapshot as unknown as BillingSnapshot
    const concept = changes.concept !== undefined ? changes.concept.trim() : snapshot.concept
    const totalCents = changes.totalCents !== undefined ? changes.totalCents : changes.total !== undefined ? Math.round(changes.total * 100) : snapshot.totalCents
    const next: BillingSnapshot = { ...snapshot, concept, totalCents, amountInWords: amountInWords(totalCents) }
    const logo = await companyLogo(snapshot.logoUrl || '')
    const pdf = await billingPdf(billingDocument({ number: account.number, status: account.status, snapshot: next as unknown as Prisma.JsonValue }, logo))
    const updated = await tx.billingAccount.update({ where: { id }, data: { concept, total: fromCentsDecimal(totalCents), snapshot: next as unknown as Prisma.InputJsonValue, pdf: Buffer.from(pdf) } })
    await audit(tx, actorId, id, 'billing:edited')
    return updated
  }, { timeout: 20000 })
}

/** Marks an issued account as paid on a Bogotá day (today by default) with an optional note; the PDF gets the "PAGADA" stamp. */
export async function payBillingAccount(id: string, payment: z.infer<typeof paySchema>, actorId: string) {
  const day = payment.paidAt || todayInBogota()
  if (day > todayInBogota()) throw new ServiceError('La fecha de pago no puede ser futura')
  return prisma.$transaction(async tx => {
    const account = await tx.billingAccount.findUnique({ where: { id } })
    if (!account) throw new ServiceError('Cuenta de cobro no encontrada', 404)
    if (account.status === 'PAID') throw new ServiceError('La cuenta ya está pagada', 409)
    if (account.status === 'VOID') throw new ServiceError('Una cuenta anulada no se puede marcar como pagada', 409)
    const paidAt = dayInstant(day)
    const snapshot = account.snapshot as unknown as BillingSnapshot
    const logo = await companyLogo(snapshot.logoUrl || '')
    const pdf = await billingPdf(billingDocument({ number: account.number, status: 'PAID', snapshot: account.snapshot, paidAt }, logo))
    const updated = await tx.billingAccount.update({ where: { id }, data: { status: 'PAID', paidAt, paymentNote: payment.note?.trim() || null, pdf: Buffer.from(pdf) } })
    await audit(tx, actorId, id, 'billing:paid')
    return updated
  }, { timeout: 20000 })
}

/** Reverts a payment (back to issued) so the account can be corrected or voided. */
export async function unpayBillingAccount(id: string, actorId: string) {
  return prisma.$transaction(async tx => {
    const account = await tx.billingAccount.findUnique({ where: { id } })
    if (!account) throw new ServiceError('Cuenta de cobro no encontrada', 404)
    if (account.status !== 'PAID') throw new ServiceError(`La cuenta no está pagada (está ${statusLabel(account.status)})`, 409)
    const snapshot = account.snapshot as unknown as BillingSnapshot
    const logo = await companyLogo(snapshot.logoUrl || '')
    const pdf = await billingPdf(billingDocument({ number: account.number, status: 'ISSUED', snapshot: account.snapshot }, logo))
    const updated = await tx.billingAccount.update({ where: { id }, data: { status: 'ISSUED', paidAt: null, paymentNote: null, pdf: Buffer.from(pdf) } })
    await audit(tx, actorId, id, 'billing:unpaid')
    return updated
  }, { timeout: 20000 })
}

export interface BulkResult { id: string; number: string | null; customer: string; status: 'done' | 'skipped' | 'error'; message: string }

/** Applies a payment or an edit to several accounts, one transaction each: a frozen or missing account never blocks the others. */
export async function bulkBillingAction(input: z.infer<typeof bulkSchema>, actorId: string): Promise<BulkResult[]> {
  const ids = Array.from(new Set(input.ids))
  const accounts = await prisma.billingAccount.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, customer: { select: { name: true, email: true, businessName: true } } } })
  const results: BulkResult[] = []
  for (const id of ids) {
    const account = accounts.find(item => item.id === id)
    if (!account) { results.push({ id, number: null, customer: '', status: 'error', message: 'La cuenta no existe' }); continue }
    const base = { id, number: formatBillingNumber(account.number), customer: account.customer.businessName || account.customer.name || account.customer.email || 'Cliente' }
    try {
      if (input.action === 'pay') { await payBillingAccount(id, { paidAt: input.paidAt, note: input.note }, actorId); results.push({ ...base, status: 'done', message: 'Marcada como pagada' }) }
      else { await editBillingAccount(id, { concept: input.concept, total: input.total }, actorId); results.push({ ...base, status: 'done', message: 'Cuenta actualizada' }) }
    } catch (error) {
      const frozen = error instanceof ServiceError && error.status === 409
      results.push({ ...base, status: frozen ? 'skipped' : 'error', message: error instanceof ServiceError ? error.message : 'No se pudo procesar la cuenta' })
      if (!(error instanceof ServiceError)) console.error(`[BILLING] bulk ${input.action} id=${id}`, error)
    }
  }
  return results
}

export const billingFileName = (account: Pick<BillingAccount, 'number'>, customerName?: string) =>
  `cuenta-de-cobro-${formatBillingNumber(account.number)}${customerName ? `-${customerName.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}` : ''}.pdf`

// ---------------------------------------------------------------------------
// Serialization for the API (Decimal -> number, Bytes omitted)
// ---------------------------------------------------------------------------
export function serializeAccount(account: Omit<BillingAccount, 'pdf'> & { pdf?: Buffer | null; customer?: { id: string; name: string | null; email: string | null; businessName: string | null; taxId: string | null } | null; template?: { id: string; concept: string } | null }) {
  const snapshot = account.snapshot as unknown as BillingSnapshot
  return {
    id: account.id, customerId: account.customerId, number: account.number, numberLabel: formatBillingNumber(account.number),
    templateId: account.templateId, period: account.period, concept: account.concept, total: cents(account.total) / 100, totalCents: cents(account.total),
    status: account.status, publicEnabled: account.publicEnabled, publicUrl: account.publicEnabled ? publicBillingUrl(account.publicToken) : null,
    issuedAt: account.issuedAt.toISOString(), dueAt: account.dueAt ? account.dueAt.toISOString() : null,
    voidedAt: account.voidedAt ? account.voidedAt.toISOString() : null, voidReason: account.voidReason, createdAt: account.createdAt.toISOString(),
    paidAt: account.paidAt ? account.paidAt.toISOString() : null, paymentNote: account.paymentNote ?? null,
    customer: account.customer ? { id: account.customer.id, name: account.customer.name || account.customer.email || 'Cliente', businessName: account.customer.businessName, taxId: account.customer.taxId, email: account.customer.email } : { id: snapshot.customer.id, name: snapshot.customer.name, businessName: snapshot.customer.businessName, taxId: snapshot.customer.taxId, email: snapshot.customer.email },
    snapshotCustomer: snapshot.customer, amountInWords: snapshot.amountInWords,
  }
}
export type SerializedAccount = ReturnType<typeof serializeAccount>

export function serializeTemplate(template: BillingTemplate & { customer?: { id: string; name: string | null; email: string | null; businessName: string | null; taxId: string | null } | null; accounts?: Pick<BillingAccount, 'id' | 'number' | 'period' | 'status' | 'issuedAt'>[]; _count?: { accounts: number } }) {
  return {
    id: template.id, customerId: template.customerId, concept: template.concept, total: cents(template.total) / 100, totalCents: cents(template.total),
    frequency: template.frequency, active: template.active, createdAt: template.createdAt.toISOString(), updatedAt: template.updatedAt.toISOString(),
    customer: template.customer ? { id: template.customer.id, name: template.customer.name || template.customer.email || 'Cliente', businessName: template.customer.businessName, taxId: template.customer.taxId, email: template.customer.email } : null,
    accountsCount: template._count?.accounts ?? template.accounts?.length ?? 0,
    accounts: template.accounts?.map(account => ({ id: account.id, number: account.number, numberLabel: formatBillingNumber(account.number), period: account.period, status: account.status, issuedAt: account.issuedAt.toISOString() })),
  }
}
export type SerializedTemplate = ReturnType<typeof serializeTemplate>
