import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson, audit } from '@/lib/accounting/server'
import { taxSchema, serializeTax, rateDecimal } from '@/lib/accounting/catalog'

export const dynamic = 'force-dynamic'

// Taxes used by existing quotes are kept forever (quotes also store name and rate).
// There is intentionally no DELETE handler: deactivate instead.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    const existing = await prisma.tax.findUnique({ where: { id: params.id } })
    if (!existing) throw new ServiceError('Impuesto no encontrado', 404)
    const parsed = taxSchema.partial().safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const input = parsed.data
    if (input.name !== undefined) {
      const duplicate = await prisma.tax.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' }, NOT: { id: params.id } }, select: { id: true } })
      if (duplicate) throw new ServiceError('Ya existe un impuesto con este nombre', 409)
    }
    const data: Prisma.TaxUpdateInput = {}
    if (input.name !== undefined) data.name = input.name
    if (input.rate !== undefined) data.rate = rateDecimal(input.rate)
    if (input.active !== undefined) data.active = input.active
    if (input.isDefault !== undefined) data.isDefault = input.isDefault
    const tax = await prisma.$transaction(async tx => {
      if (input.isDefault) await tx.tax.updateMany({ where: { isDefault: true, NOT: { id: params.id } }, data: { isDefault: false } })
      const updated = await tx.tax.update({ where: { id: params.id }, data })
      const action = input.active !== undefined && input.active !== existing.active
        ? (input.active ? 'taxes:activated' : 'taxes:deactivated')
        : 'taxes:updated'
      await audit(tx, user.id, updated.id, action)
      return updated
    })
    return Response.json(serializeTax(tax))
  } catch (error) { return serviceError(error) }
}
