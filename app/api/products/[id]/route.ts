import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson, audit } from '@/lib/accounting/server'
import { productSchema, serializeProduct, priceDecimal } from '@/lib/accounting/catalog'

export const dynamic = 'force-dynamic'

// Products are never deleted: quotes keep their history and inactive products simply
// stop being offered for new quotes. There is intentionally no DELETE handler.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    const existing = await prisma.product.findUnique({ where: { id: params.id } })
    if (!existing) throw new ServiceError('Producto no encontrado', 404)
    const parsed = productSchema.partial().safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const input = parsed.data
    if (input.name !== undefined) {
      const duplicate = await prisma.product.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' }, NOT: { id: params.id } }, select: { id: true } })
      if (duplicate) throw new ServiceError('Ya existe un producto con este nombre', 409)
    }
    const data: Prisma.ProductUpdateInput = {}
    if (input.name !== undefined) data.name = input.name
    if (input.description !== undefined) data.description = input.description || null
    if (input.price !== undefined) data.price = priceDecimal(input.price)
    if (input.active !== undefined) data.active = input.active
    const product = await prisma.product.update({ where: { id: params.id }, data })
    const action = input.active !== undefined && input.active !== existing.active
      ? (input.active ? 'products:activated' : 'products:deactivated')
      : 'products:updated'
    await audit(prisma, user.id, product.id, action)
    return Response.json(serializeProduct(product))
  } catch (error) { return serviceError(error) }
}
