import { Prisma, type InventoryMovementType } from '@prisma/client'
import { z } from 'zod'
import { ServiceError, audit } from '@/lib/accounting/server'

// Stock changes are serialized per product: the row is locked (SELECT ... FOR UPDATE) inside
// the caller's transaction, the new balance is computed and the movement records it (kardex).
type Tx = Prisma.TransactionClient

export const movementTypeLabels: Record<InventoryMovementType, string> = {
  PURCHASE: 'Compra', ENTRY: 'Entrada', WRITE_OFF: 'Baja', COUNT: 'Conteo', LOAN_OUT: 'Salida en préstamo', LOAN_IN: 'Devolución de préstamo',
}

export const movementSchema = z.object({
  productId: z.string().min(1, 'Selecciona el producto').max(100),
  type: z.enum(['PURCHASE', 'ENTRY', 'WRITE_OFF', 'COUNT']),
  /** Units moved; for COUNT it is the quantity found in the physical count. */
  quantity: z.number().int('Usa unidades enteras').min(0).max(1000000),
  unitCost: z.number().finite().min(0).max(99999999999).nullable().optional(),
  reference: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
}).refine(input => input.type === 'COUNT' || input.quantity > 0, { message: 'La cantidad debe ser mayor que cero', path: ['quantity'] })
export type MovementInput = z.infer<typeof movementSchema>

async function lockStock(tx: Tx, productId: string) {
  const rows = await tx.$queryRaw<{ id: string; stock: number; active: boolean; name: string }[]>`SELECT "id", "stock", "active", "name" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`
  if (!rows.length) throw new ServiceError('El producto no existe', 404)
  return rows[0]
}

export interface ApplyMovement {
  productId: string
  type: InventoryMovementType
  /** Signed effect on the stock, except for COUNT where it is the counted quantity. */
  quantity: number
  unitCostCents?: number | null
  reference?: string | null
  notes?: string | null
  loanId?: string | null
  actorId: string
}

/** Applies one movement to the product stock and writes the kardex line. Must run inside a transaction. */
export async function applyMovement(tx: Tx, input: ApplyMovement) {
  const product = await lockStock(tx, input.productId)
  let delta = input.quantity, counted: number | null = null
  if (input.type === 'COUNT') { counted = input.quantity; delta = counted - product.stock }
  else if (input.type === 'WRITE_OFF' || input.type === 'LOAN_OUT') delta = -Math.abs(input.quantity)
  else delta = Math.abs(input.quantity)
  const balanceAfter = product.stock + delta
  if (balanceAfter < 0) throw new ServiceError(`Existencias insuficientes de «${product.name}»: hay ${product.stock} y se requieren ${Math.abs(delta)}`, 409)
  await tx.product.update({ where: { id: product.id }, data: { stock: balanceAfter } })
  const movement = await tx.inventoryMovement.create({ data: {
    productId: product.id, type: input.type, quantity: delta, balanceAfter, countedQuantity: counted,
    unitCost: input.unitCostCents == null ? null : new Prisma.Decimal(input.unitCostCents).div(100),
    reference: input.reference?.trim() || null, notes: input.notes?.trim() || null, loanId: input.loanId || null, createdById: input.actorId,
  } })
  await audit(tx, input.actorId, movement.id, `inventory:${input.type.toLowerCase()}`)
  return { movement, previousStock: product.stock, stock: balanceAfter }
}

// ---------------------------------------------------------------------------
// Equipment loans
// ---------------------------------------------------------------------------
const photos = z.array(z.string().regex(/^\/uploads\/[a-zA-Z0-9._-]+$/, 'Foto inválida')).max(10, 'Máximo 10 fotos')
export const loanItemSchema = z.object({
  productId: z.string().min(1, 'Selecciona el equipo').max(100),
  quantity: z.number().int('Usa unidades enteras').min(1, 'La cantidad mínima es 1').max(1000),
})
// An exit order lists one or more pieces of equipment; the same product cannot appear twice.
export const loanOutSchema = z.object({
  items: z.array(loanItemSchema).min(1, 'Agrega al menos un equipo').max(50, 'Máximo 50 equipos por salida'),
  customerId: z.string().min(1, 'Selecciona el cliente').max(100),
  technicianId: z.string().min(1, 'Selecciona el técnico encargado').max(100),
  notes: z.string().trim().max(1000).optional().default(''),
  photos: photos.default([]),
}).refine(input => new Set(input.items.map(item => item.productId)).size === input.items.length, { message: 'Un equipo aparece más de una vez: súmalo en una sola línea', path: ['items'] })
// A return always refers to an open exit order: equipment, units, customer and technician come from it.
export const loanReturnSchema = z.object({
  loanId: z.string().min(1, 'Selecciona la orden de salida que se devuelve').max(100),
  notes: z.string().trim().max(1000).optional().default(''),
  photos: photos.default([]),
})

/** Registers an exit (préstamo): validates customer, technician and equipment, discounts stock and opens the loan. */
export async function issueLoan(tx: Tx, input: z.infer<typeof loanOutSchema>, actorId: string) {
  const productIds = input.items.map(item => item.productId)
  const [customer, technician, products] = await Promise.all([
    tx.user.findFirst({ where: { id: input.customerId, role: 'CUSTOMER' }, select: { id: true } }),
    tx.user.findFirst({ where: { id: input.technicianId, role: { in: ['ADMIN', 'AGENT', 'ACCOUNTING'] } }, select: { id: true } }),
    tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, active: true } }),
  ])
  if (!customer) throw new ServiceError('Selecciona un cliente válido')
  if (!technician) throw new ServiceError('Selecciona un técnico válido')
  for (const id of productIds) {
    const product = products.find(candidate => candidate.id === id)
    if (!product) throw new ServiceError('Uno de los equipos no existe en el catálogo', 404)
    if (!product.active) throw new ServiceError(`El producto «${product.name}» está inactivo`)
  }
  const loan = await tx.equipmentLoan.create({ data: {
    customerId: customer.id, technicianId: technician.id, outNotes: input.notes || null, outPhotos: input.photos, createdById: actorId,
    items: { create: input.items.map((item, position) => ({ productId: item.productId, quantity: item.quantity, position })) },
  } })
  // Every line discounts its own stock; the product row lock serializes concurrent exits.
  for (const item of input.items) {
    await applyMovement(tx, { productId: item.productId, type: 'LOAN_OUT', quantity: item.quantity, reference: `Préstamo #${loan.number}`, notes: input.notes, loanId: loan.id, actorId })
  }
  await audit(tx, actorId, loan.id, 'loans:out')
  return loan
}

/** Registers the return of an open exit order: every piece of equipment comes back to stock and the order closes. */
export async function returnLoan(tx: Tx, input: z.infer<typeof loanReturnSchema>, actorId: string) {
  const loan = await tx.equipmentLoan.findUnique({ where: { id: input.loanId }, include: { items: { orderBy: { position: 'asc' } } } })
  if (!loan) throw new ServiceError('La orden de salida no existe. Toda entrada debe partir de una salida registrada.', 404)
  if (loan.status === 'RETURNED') throw new ServiceError('Esta orden de salida ya fue devuelta', 409)
  const updated = await tx.equipmentLoan.updateMany({ where: { id: loan.id, status: 'OUT' }, data: { status: 'RETURNED', returnedAt: new Date(), returnNotes: input.notes || null, returnPhotos: input.photos, returnedById: actorId } })
  if (!updated.count) throw new ServiceError('Esta orden de salida ya fue devuelta', 409)
  for (const item of loan.items) {
    await applyMovement(tx, { productId: item.productId, type: 'LOAN_IN', quantity: item.quantity, reference: `Devolución préstamo #${loan.number}`, notes: input.notes, loanId: loan.id, actorId })
  }
  await audit(tx, actorId, loan.id, 'loans:returned')
  return tx.equipmentLoan.findUniqueOrThrow({ where: { id: loan.id } })
}

/** Days (and hours under a day) elapsed since a loan went out. */
export function loanAge(outAt: Date | string, now = new Date()) {
  const ms = now.getTime() - new Date(outAt).getTime()
  const days = Math.floor(ms / 86400000), hours = Math.floor((ms % 86400000) / 3600000)
  return { days, hours, label: days >= 1 ? `${days} día${days === 1 ? '' : 's'}` : `${Math.max(hours, 0)} hora${hours === 1 ? '' : 's'}` }
}
