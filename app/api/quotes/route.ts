import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, readJson, ServiceError } from '@/lib/accounting/server'
import { quoteSchema, createQuote, serializeQuote, quoteInclude } from '@/lib/accounting/quotes'
import { dailyRange } from '@/lib/daily-filter'

export const dynamic = 'force-dynamic'
const PER_PAGE = 20

// List of quotes with optional search, customer and creation-date filters.
export async function GET(request: Request) {
  try {
    await accountingUser()
    const params = new URL(request.url).searchParams
    const q = (params.get('q') || '').trim().slice(0, 100)
    const customer = (params.get('customer') || '').trim()
    const from = params.get('from'), to = params.get('to')
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)

    const where: Prisma.QuoteWhereInput = {}
    if (customer) where.customerId = customer
    if (from || to) {
      const range = dailyRange(from, to)
      where.createdAt = { gte: range.gte, lt: range.lt }
    }
    if (q) {
      const digits = q.replace(/^cot-?/i, '').replace(/^0+/, '')
      const number = /^\d{1,9}$/.test(digits) ? parseInt(digits, 10) : undefined
      where.OR = [
        ...(number !== undefined ? [{ number }] : []),
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { businessName: { contains: q, mode: 'insensitive' } } },
        { customer: { email: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({ where, include: quoteInclude, orderBy: { number: 'desc' }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
      prisma.quote.count({ where }),
    ])
    return Response.json({ quotes: quotes.map(serializeQuote), total, page, perPage: PER_PAGE })
  } catch (error) { return serviceError(error) }
}

// Creates a quote; products, prices, customer and company are frozen in the record.
export async function POST(request: Request) {
  try {
    const user = await accountingUser()
    const parsed = quoteSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const created = await createQuote(parsed.data, user.id)
    const quote = await prisma.quote.findUnique({ where: { id: created.id }, include: quoteInclude })
    if (!quote) throw new ServiceError('No se pudo leer la cotización creada', 503)
    return Response.json(serializeQuote(quote), { status: 201 })
  } catch (error) { return serviceError(error) }
}
