import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson, audit } from '@/lib/accounting/server'
import { taxSchema, serializeTax, rateDecimal, ensureDefaultTax } from '@/lib/accounting/catalog'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await accountingUser()
    await ensureDefaultTax()
    const onlyActive = new URL(request.url).searchParams.get('active') === '1'
    const taxes = await prisma.tax.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
    return Response.json(taxes.map(serializeTax))
  } catch (error) { return serviceError(error) }
}

export async function POST(request: Request) {
  try {
    const user = await accountingUser()
    const parsed = taxSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const input = parsed.data
    const duplicate = await prisma.tax.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } }, select: { id: true } })
    if (duplicate) throw new ServiceError('Ya existe un impuesto con este nombre', 409)
    const tax = await prisma.$transaction(async tx => {
      // Only one tax is preselected in new quotes.
      if (input.isDefault) await tx.tax.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
      const created = await tx.tax.create({ data: { name: input.name, rate: rateDecimal(input.rate), active: input.active, isDefault: input.isDefault } })
      await audit(tx, user.id, created.id, 'taxes:created')
      return created
    })
    return Response.json(serializeTax(tax), { status: 201 })
  } catch (error) { return serviceError(error) }
}
