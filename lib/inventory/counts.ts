import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ServiceError, audit } from '@/lib/accounting/server'
import { applyMovement } from './stock'

// Bulk physical count: one COUNT movement per selected product inside a single transaction,
// plus an immutable report (ServiceRecord kind 'inventory-count') for the PDF and the history.
export const COUNT_KIND = 'inventory-count'
export const countId = (uuid: string) => `${COUNT_KIND}:${uuid}`
/** Short reference printed on documents: last 8 characters of the uuid, uppercase. */
export const shortCountId = (id: string) => id.replace(/^inventory-count:/, '').replace(/-/g, '').slice(-8).toUpperCase()

export const bulkCountSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1).max(100),
    counted: z.number().int('Usa unidades enteras').min(0, 'La cantidad no puede ser negativa').max(1000000),
  })).min(1, 'Selecciona al menos un producto').max(500, 'Máximo 500 productos por conteo')
    .refine(items => new Set(items.map(item => item.productId)).size === items.length, 'Hay productos repetidos en el conteo'),
  notes: z.string().trim().max(1000).optional().default(''),
})
export type BulkCountInput = z.infer<typeof bulkCountSchema>

export interface CountRow { productId: string; name: string; theoretical: number; counted: number; difference: number }
export interface CountTotals { products: number; theoretical: number; counted: number; difference: number; withDifference: number }
export interface BulkCountReport {
  id: string
  rows: CountRow[]
  totals: CountTotals
  notes: string
  performedAt: string
  performedById: string
  performedBy: string
}

export async function performBulkCount(input: BulkCountInput, actor: { id: string; name: string | null; email: string | null }): Promise<BulkCountReport> {
  const id = countId(randomUUID())
  const reference = `Conteo masivo ${shortCountId(id)}`
  return prisma.$transaction(async tx => {
    const products = await tx.product.findMany({ where: { id: { in: input.items.map(item => item.productId) } }, select: { id: true, name: true } })
    if (products.length !== input.items.length) throw new ServiceError('Uno de los productos no existe', 404)
    const names = new Map(products.map(product => [product.id, product.name]))
    const rows: CountRow[] = []
    for (const item of input.items) {
      const result = await applyMovement(tx, { productId: item.productId, type: 'COUNT', quantity: item.counted, reference, notes: input.notes, actorId: actor.id })
      rows.push({ productId: item.productId, name: names.get(item.productId) || 'Producto', theoretical: result.previousStock, counted: item.counted, difference: item.counted - result.previousStock })
    }
    const totals: CountTotals = {
      products: rows.length,
      theoretical: rows.reduce((sum, row) => sum + row.theoretical, 0),
      counted: rows.reduce((sum, row) => sum + row.counted, 0),
      difference: rows.reduce((sum, row) => sum + row.difference, 0),
      withDifference: rows.filter(row => row.difference !== 0).length,
    }
    const payload: Omit<BulkCountReport, 'id'> = { rows, totals, notes: input.notes, performedAt: new Date().toISOString(), performedById: actor.id, performedBy: actor.name || actor.email || 'Usuario' }
    await tx.serviceRecord.create({ data: { id, kind: COUNT_KIND, payload: payload as unknown as Prisma.InputJsonValue } })
    await audit(tx, actor.id, id, 'inventory:bulk-count')
    return { id, ...payload }
  }, { timeout: 60000 })
}

export async function listBulkCounts(limit = 50) {
  const records = await prisma.serviceRecord.findMany({ where: { kind: COUNT_KIND }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, payload: true } })
  return records.map(record => {
    const payload = record.payload as unknown as Omit<BulkCountReport, 'id'>
    return { id: record.id, shortId: shortCountId(record.id), performedAt: payload.performedAt, performedBy: payload.performedBy, totals: payload.totals, notes: payload.notes }
  })
}

export async function getBulkCount(id: string): Promise<BulkCountReport | null> {
  const record = await prisma.serviceRecord.findFirst({ where: { id, kind: COUNT_KIND }, select: { id: true, payload: true } })
  if (!record) return null
  return { id: record.id, ...(record.payload as unknown as Omit<BulkCountReport, 'id'>) }
}
