import { prisma } from '@/lib/prisma'
import { accountingUser, staffUser, serviceError, ServiceError, readJson, audit } from '@/lib/accounting/server'
import { productSchema, serializeProduct, priceDecimal } from '@/lib/accounting/catalog'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await staffUser()
    const onlyActive = new URL(request.url).searchParams.get('active') === '1'
    const products = await prisma.product.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    })
    return Response.json(products.map(serializeProduct))
  } catch (error) { return serviceError(error) }
}

export async function POST(request: Request) {
  try {
    const user = await staffUser()
    const parsed = productSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const input = parsed.data
    const duplicate = await prisma.product.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } }, select: { id: true } })
    if (duplicate) throw new ServiceError('Ya existe un producto con este nombre', 409)
    const product = await prisma.product.create({ data: {
      name: input.name, description: input.description || null, price: priceDecimal(input.price), active: input.active,
    } })
    await audit(prisma, user.id, product.id, 'products:created')
    return Response.json(serializeProduct(product), { status: 201 })
  } catch (error) { return serviceError(error) }
}
