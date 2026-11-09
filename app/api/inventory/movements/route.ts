import { Prisma, type InventoryMovementType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { staffUser, serviceError, ServiceError, readJson, decimal } from '@/lib/accounting/server'
import { movementSchema, applyMovement, movementTypeLabels } from '@/lib/inventory/stock'
import { creatorsById } from '@/lib/accounting/creators'
import { dailyRange } from '@/lib/daily-filter'

export const dynamic = 'force-dynamic'
const PER_PAGE = 50
const TYPES: InventoryMovementType[] = ['PURCHASE', 'ENTRY', 'WRITE_OFF', 'COUNT', 'LOAN_OUT', 'LOAN_IN']

type MovementRow = Prisma.InventoryMovementGetPayload<{ include: { product: { select: { name: true } }; loan: { select: { number: true } } } }>
const serialize = (movement: MovementRow, creators: Record<string, { id: string; name: string }>) => ({
  id: movement.id, productId: movement.productId, productName: movement.product.name,
  type: movement.type, typeLabel: movementTypeLabels[movement.type], quantity: movement.quantity, balanceAfter: movement.balanceAfter,
  unitCost: decimal(movement.unitCost), countedQuantity: movement.countedQuantity, reference: movement.reference, notes: movement.notes,
  loanId: movement.loanId, loanNumber: movement.loan?.number ?? null,
  createdBy: movement.createdById ? creators[movement.createdById] || null : null, createdAt: movement.createdAt.toISOString(),
})

// Kardex: movements newest first, filtered by product, type and date.
export async function GET(request: Request) {
  try {
    await staffUser()
    const params = new URL(request.url).searchParams
    const product = (params.get('product') || '').trim()
    const type = params.get('type') || ''
    const from = params.get('from') || '', to = params.get('to') || ''
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
    const where: Prisma.InventoryMovementWhereInput = {
      ...(product ? { productId: product } : {}),
      ...(TYPES.includes(type as InventoryMovementType) ? { type: type as InventoryMovementType } : {}),
    }
    if (from || to) { const range = dailyRange(from, to); where.createdAt = { gte: range.gte, lt: range.lt } }
    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({ where, include: { product: { select: { name: true } }, loan: { select: { number: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
      prisma.inventoryMovement.count({ where }),
    ])
    const creators = await creatorsById(movements.map(movement => movement.createdById))
    return Response.json({ movements: movements.map(movement => serialize(movement, creators)), total, page, perPage: PER_PAGE })
  } catch (error) { return serviceError(error) }
}

// Registers a purchase, entry, write-off or physical count.
export async function POST(request: Request) {
  try {
    const user = await staffUser()
    const parsed = movementSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const input = parsed.data
    const result = await prisma.$transaction(tx => applyMovement(tx, {
      productId: input.productId, type: input.type, quantity: input.quantity,
      unitCostCents: input.unitCost == null ? null : Math.round(input.unitCost * 100),
      reference: input.reference, notes: input.notes, actorId: user.id,
    }))
    const movement = await prisma.inventoryMovement.findUniqueOrThrow({ where: { id: result.movement.id }, include: { product: { select: { name: true } }, loan: { select: { number: true } } } })
    const creators = await creatorsById([movement.createdById])
    return Response.json({ movement: serialize(movement, creators), stock: result.stock, previousStock: result.previousStock }, { status: 201 })
  } catch (error) { return serviceError(error) }
}
