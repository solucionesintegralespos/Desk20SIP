import { Prisma, type Quote, type QuoteItem } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ServiceError, audit, cents, decimal, fromCentsDecimal } from './server'
import { loadCompanyProfile, companyLogo, docCompany } from './company'
import { quotePdf, type QuoteDocument } from './quote-pdf'
import { formatQuoteNumber, quoteTotals, toCents } from './format'
import { customerSnapshot } from './billing'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export const quoteItemSchema = z.object({
  productId: z.string().min(1).max(100).nullable().optional(),
  name: z.string().trim().min(1, 'Describe cada producto').max(250),
  description: z.string().trim().max(1000).optional().default(''),
  quantity: z.number().finite().gt(0, 'La cantidad debe ser mayor que cero').max(1000000),
  unitPrice: z.number().finite().min(0, 'El precio no puede ser negativo').max(99999999999),
})
export const quoteSchema = z.object({
  /** Registered customer; omit it to quote a customer that is not in the system. */
  customerId: z.string().min(1).max(100).nullable().optional(),
  /** Free-text name used when there is no registered customer. */
  customerName: z.string().trim().max(200).optional().default(''),
  /** Optional email of an unregistered customer, so the quote can still be sent. */
  customerEmail: z.string().trim().max(254).refine(value => !value || /^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(value), 'Ingresa un correo válido').optional().default(''),
  taxId: z.string().min(1).max(100).nullable().optional(),
  items: z.array(quoteItemSchema).min(1, 'Agrega al menos un producto').max(100),
  title: z.string().trim().max(100).optional().default('Cotización'),
  notes: z.string().trim().max(2000).optional().default(''),
  conditions: z.string().trim().max(4000).optional(),
})
export type QuoteInput = z.infer<typeof quoteSchema>

export interface IssuerSnapshot { id: string; name: string; jobTitle: string | null; email: string | null; phone: string | null }
export interface CompanySnapshot { name: string; nit: string; phone: string; email: string; website: string; address: string; city: string; logoUrl: string; issuer?: IssuerSnapshot | null }

/** Snapshot of a customer that is not registered: only the typed name is known. */
export const freeCustomerSnapshot = (name: string, email = '') => ({ id: null as string | null, name: name.trim(), businessName: null, taxId: null, email: email.trim().toLowerCase() || null, phone: null, address: null, city: null })

/**
 * Creates a quote with the customer, company, products and tax frozen as they are now.
 * Prices are taken from the input (editable per quote), never from the catalog.
 */
/** Validates the input against the catalog and customer directory and computes totals and snapshots (shared by create and update). */
async function prepareQuote(tx: Prisma.TransactionClient, input: QuoteInput) {
  if (!input.customerId && !input.customerName.trim()) throw new ServiceError('Selecciona el cliente o escribe su nombre')
  const customer = input.customerId ? await tx.user.findFirst({ where: { id: input.customerId, role: 'CUSTOMER' }, select: { id: true, name: true, email: true, businessName: true, taxId: true, phone: true, address: true, location: true } }) : null
  if (input.customerId && !customer) throw new ServiceError('Selecciona un cliente válido')
  const tax = input.taxId ? await tx.tax.findUnique({ where: { id: input.taxId } }) : null
  if (input.taxId && (!tax || !tax.active)) throw new ServiceError('Selecciona un impuesto activo')
  const productIds = Array.from(new Set(input.items.map(item => item.productId).filter((id): id is string => !!id)))
  const products = productIds.length ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, active: true } }) : []
  if (products.length !== productIds.length) throw new ServiceError('Uno de los productos no existe')
  if (products.some(product => !product.active)) throw new ServiceError('Los productos inactivos no están disponibles para nuevas cotizaciones')
  const totals = quoteTotals(input.items.map(item => ({ quantity: item.quantity, unitPriceCents: toCents(item.unitPrice) })), tax ? decimal(tax.rate) : null)
  const items = input.items.map((item, index) => ({
    productId: item.productId || null, position: index + 1, name: item.name, description: item.description || null,
    quantity: new Prisma.Decimal(Math.round(item.quantity * 100)).div(100), unitPrice: fromCentsDecimal(toCents(item.unitPrice)), total: fromCentsDecimal(totals.lines[index]),
  }))
  const customerData = (customer ? customerSnapshot(customer) : freeCustomerSnapshot(input.customerName, input.customerEmail)) as unknown as Prisma.InputJsonValue
  return {
    items,
    data: {
      customerId: customer?.id || null, customerSnapshot: customerData,
      taxId: tax?.id || null, taxName: tax?.name || null, taxRate: tax ? tax.rate : null,
      subtotal: fromCentsDecimal(totals.subtotalCents), taxAmount: fromCentsDecimal(totals.taxCents), total: fromCentsDecimal(totals.totalCents),
      title: input.title || 'Cotización', notes: input.notes || null,
    },
  }
}

export async function createQuote(input: QuoteInput, actorId: string) {
  const company = await loadCompanyProfile()
  return prisma.$transaction(async tx => {
    const { data, items } = await prepareQuote(tx, input)
    const issuer = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, name: true, email: true, jobTitle: true, phone: true } })
    const companySnapshot: CompanySnapshot = { ...docCompany(company), logoUrl: company.logoUrl, issuer: issuer ? { id: issuer.id, name: issuer.name || issuer.email || 'Usuario', jobTitle: issuer.jobTitle, email: issuer.email, phone: issuer.phone } : null }
    const quote = await tx.quote.create({ data: {
      ...data, companySnapshot: companySnapshot as unknown as Prisma.InputJsonValue, conditions: input.conditions ?? company.quoteConditions, createdById: actorId,
      items: { create: items },
    }, include: { items: { orderBy: { position: 'asc' } } } })
    await audit(tx, actorId, quote.id, 'quotes:created')
    return quote
  })
}

/**
 * Replaces the content of an existing quote (customer, products, prices, tax, texts). The
 * number, the creation date and the original signer are kept; the lines are rewritten.
 */
export async function updateQuote(id: string, input: QuoteInput, actorId: string) {
  return prisma.$transaction(async tx => {
    const existing = await tx.quote.findUnique({ where: { id }, select: { id: true, conditions: true } })
    if (!existing) throw new ServiceError('Cotización no encontrada', 404)
    const { data, items } = await prepareQuote(tx, input)
    await tx.quoteItem.deleteMany({ where: { quoteId: id } })
    const quote = await tx.quote.update({ where: { id }, data: {
      ...data, conditions: input.conditions ?? existing.conditions,
      items: { create: items },
    }, include: { items: { orderBy: { position: 'asc' } } } })
    await audit(tx, actorId, quote.id, 'quotes:updated')
    return quote
  })
}

export type QuoteWithItems = Quote & { items: QuoteItem[]; customer?: { id: string; name: string | null; email: string | null; businessName: string | null; taxId: string | null; emailNotifications: boolean } | null }

/** Document data from a stored quote (snapshots only), ready for the PDF engine. */
export async function quoteDocument(quote: QuoteWithItems): Promise<QuoteDocument> {
  const company = quote.companySnapshot as unknown as CompanySnapshot
  const logo = await companyLogo(company.logoUrl || '')
  return quoteDocumentSync(quote, logo)
}
export function quoteDocumentSync(quote: QuoteWithItems, logo?: QuoteDocument['logo']): QuoteDocument {
  const company = quote.companySnapshot as unknown as CompanySnapshot
  const customer = quote.customerSnapshot as unknown as ReturnType<typeof freeCustomerSnapshot>
  return {
    company: { name: company.name, nit: company.nit, phone: company.phone, email: company.email, website: company.website, address: company.address, city: company.city }, logo, signer: company.issuer || null,
    number: formatQuoteNumber(quote.number), date: quote.createdAt.toISOString(), customer,
    items: quote.items.map(item => ({ name: item.name, description: item.description, quantity: decimal(item.quantity) || 0, unitPriceCents: cents(item.unitPrice), totalCents: cents(item.total) })),
    subtotalCents: cents(quote.subtotal), taxName: quote.taxName, taxRatePercent: decimal(quote.taxRate), taxCents: cents(quote.taxAmount), totalCents: cents(quote.total),
    title: quote.title, notes: quote.notes, conditions: quote.conditions,
  }
}
export async function quotePdfBuffer(quote: QuoteWithItems) {
  return Buffer.from(await quotePdf(await quoteDocument(quote)))
}
export const quoteFileName = (quote: Pick<Quote, 'number'>) => `cotizacion-${formatQuoteNumber(quote.number)}.pdf`

export function serializeQuote(quote: QuoteWithItems) {
  const customer = quote.customerSnapshot as unknown as ReturnType<typeof freeCustomerSnapshot>
  return {
    id: quote.id, number: quote.number, numberLabel: formatQuoteNumber(quote.number), customerId: quote.customerId,
    /** Registered customer when linked; otherwise the free-text name from the snapshot (no email to send to). */
    customer: quote.customer ? { id: quote.customer.id, name: quote.customer.name || quote.customer.email || 'Cliente', businessName: quote.customer.businessName, taxId: quote.customer.taxId, email: quote.customer.email, emailNotifications: quote.customer.emailNotifications } : { id: customer.id, name: customer.name, businessName: customer.businessName, taxId: customer.taxId, email: customer.email, emailNotifications: true },
    registered: !!quote.customer, issuer: (quote.companySnapshot as unknown as CompanySnapshot).issuer || null,
    snapshotCustomer: customer, companySnapshot: quote.companySnapshot as unknown as CompanySnapshot,
    taxId: quote.taxId, taxName: quote.taxName, taxRate: decimal(quote.taxRate),
    subtotal: cents(quote.subtotal) / 100, taxAmount: cents(quote.taxAmount) / 100, total: cents(quote.total) / 100,
    subtotalCents: cents(quote.subtotal), taxCents: cents(quote.taxAmount), totalCents: cents(quote.total),
    title: quote.title, notes: quote.notes, conditions: quote.conditions, createdAt: quote.createdAt.toISOString(),
    items: quote.items.map(item => ({ id: item.id, productId: item.productId, position: item.position, name: item.name, description: item.description, quantity: decimal(item.quantity) || 0, unitPrice: cents(item.unitPrice) / 100, unitPriceCents: cents(item.unitPrice), total: cents(item.total) / 100, totalCents: cents(item.total) })),
  }
}
export type SerializedQuote = ReturnType<typeof serializeQuote>
export const quoteInclude = { items: { orderBy: { position: 'asc' as const } }, customer: { select: { id: true, name: true, email: true, businessName: true, taxId: true, emailNotifications: true } } }
