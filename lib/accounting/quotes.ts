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
  customerId: z.string().min(1, 'Selecciona el cliente').max(100),
  taxId: z.string().min(1).max(100).nullable().optional(),
  items: z.array(quoteItemSchema).min(1, 'Agrega al menos un producto').max(100),
  title: z.string().trim().max(100).optional().default('Cotización'),
  notes: z.string().trim().max(2000).optional().default(''),
  conditions: z.string().trim().max(4000).optional(),
})
export type QuoteInput = z.infer<typeof quoteSchema>

export interface CompanySnapshot { name: string; nit: string; phone: string; email: string; website: string; address: string; city: string; logoUrl: string }

/**
 * Creates a quote with the customer, company, products and tax frozen as they are now.
 * Prices are taken from the input (editable per quote), never from the catalog.
 */
export async function createQuote(input: QuoteInput, actorId: string) {
  const company = await loadCompanyProfile()
  return prisma.$transaction(async tx => {
    const customer = await tx.user.findFirst({ where: { id: input.customerId, role: 'CUSTOMER' }, select: { id: true, name: true, email: true, businessName: true, taxId: true, phone: true, address: true, location: true } })
    if (!customer) throw new ServiceError('Selecciona un cliente válido')
    const tax = input.taxId ? await tx.tax.findUnique({ where: { id: input.taxId } }) : null
    if (input.taxId && (!tax || !tax.active)) throw new ServiceError('Selecciona un impuesto activo')
    const productIds = Array.from(new Set(input.items.map(item => item.productId).filter((id): id is string => !!id)))
    const products = productIds.length ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, active: true } }) : []
    if (products.length !== productIds.length) throw new ServiceError('Uno de los productos no existe')
    if (products.some(product => !product.active)) throw new ServiceError('Los productos inactivos no están disponibles para nuevas cotizaciones')
    const totals = quoteTotals(input.items.map(item => ({ quantity: item.quantity, unitPriceCents: toCents(item.unitPrice) })), tax ? decimal(tax.rate) : null)
    const quote = await tx.quote.create({ data: {
      customerId: customer.id, customerSnapshot: customerSnapshot(customer) as unknown as Prisma.InputJsonValue,
      companySnapshot: { ...docCompany(company), logoUrl: company.logoUrl } as unknown as Prisma.InputJsonValue,
      taxId: tax?.id || null, taxName: tax?.name || null, taxRate: tax ? tax.rate : null,
      subtotal: fromCentsDecimal(totals.subtotalCents), taxAmount: fromCentsDecimal(totals.taxCents), total: fromCentsDecimal(totals.totalCents),
      title: input.title || 'Cotización', notes: input.notes || null, conditions: input.conditions ?? company.quoteConditions, createdById: actorId,
      items: { create: input.items.map((item, index) => ({
        productId: item.productId || null, position: index + 1, name: item.name, description: item.description || null,
        quantity: new Prisma.Decimal(Math.round(item.quantity * 100)).div(100), unitPrice: fromCentsDecimal(toCents(item.unitPrice)), total: fromCentsDecimal(totals.lines[index]),
      })) },
    }, include: { items: { orderBy: { position: 'asc' } } } })
    await audit(tx, actorId, quote.id, 'quotes:created')
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
  const customer = quote.customerSnapshot as unknown as ReturnType<typeof customerSnapshot>
  return {
    company: { name: company.name, nit: company.nit, phone: company.phone, email: company.email, website: company.website, address: company.address, city: company.city }, logo,
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
  const customer = quote.customerSnapshot as unknown as ReturnType<typeof customerSnapshot>
  return {
    id: quote.id, number: quote.number, numberLabel: formatQuoteNumber(quote.number), customerId: quote.customerId,
    customer: quote.customer ? { id: quote.customer.id, name: quote.customer.name || quote.customer.email || 'Cliente', businessName: quote.customer.businessName, taxId: quote.customer.taxId, email: quote.customer.email, emailNotifications: quote.customer.emailNotifications } : { id: customer.id, name: customer.name, businessName: customer.businessName, taxId: customer.taxId, email: customer.email, emailNotifications: true },
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
