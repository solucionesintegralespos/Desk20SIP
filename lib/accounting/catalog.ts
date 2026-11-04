import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { decimal } from './server'

// Product and tax catalog used by quotes. Nothing here is ever deleted: inactive
// entries stop being offered, while existing quotes keep their own snapshots.

export const productSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200, 'El nombre no puede superar 200 caracteres'),
  description: z.string().trim().max(1000, 'La descripción no puede superar 1000 caracteres').optional().default(''),
  price: z.number().finite().min(0, 'El precio no puede ser negativo').max(99999999999, 'El precio es demasiado alto'),
  active: z.boolean().optional().default(true),
})
export type ProductInput = z.infer<typeof productSchema>

export const serializeProduct = (product: { id: string; name: string; description: string | null; price: Prisma.Decimal; active: boolean; createdAt: Date; updatedAt: Date }) => ({
  id: product.id, name: product.name, description: product.description, price: decimal(product.price) ?? 0,
  active: product.active, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString(),
})
export type SerializedProduct = ReturnType<typeof serializeProduct>

// Prices are stored with two decimals; the quote engine works in integer cents.
export const priceDecimal = (value: number) => new Prisma.Decimal(Math.round(value * 100)).div(100)

export const taxSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'El nombre no puede superar 100 caracteres'),
  rate: z.number().finite().min(0, 'El porcentaje no puede ser negativo').max(100, 'El porcentaje no puede superar 100')
    .refine(value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6, 'Usa máximo cuatro decimales en el porcentaje'),
  active: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
})
export type TaxInput = z.infer<typeof taxSchema>

export const serializeTax = (tax: { id: string; name: string; rate: Prisma.Decimal; active: boolean; isDefault: boolean }) => ({
  id: tax.id, name: tax.name, rate: decimal(tax.rate) ?? 0, active: tax.active, isDefault: tax.isDefault,
})
export type SerializedTax = ReturnType<typeof serializeTax>

export const rateDecimal = (value: number) => new Prisma.Decimal(Math.round(value * 10000)).div(10000)

/** Same seed as the SQL migration: IVA 19 % exists and is preselected from the first use. */
export async function ensureDefaultTax() {
  if (await prisma.tax.count() === 0) {
    await prisma.tax.upsert({
      where: { id: 'tax-iva-19' },
      create: { id: 'tax-iva-19', name: 'IVA 19%', rate: rateDecimal(19), active: true, isDefault: true },
      update: {},
    })
  }
}
