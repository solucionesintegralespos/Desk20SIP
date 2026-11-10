import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { xlsx } from '@/lib/xlsx'
import { readXlsx, type XlsxValue } from '@/lib/xlsx-read'
import { priceDecimal } from './catalog'
import { audit } from './server'

// Product catalog <-> Excel. Columns are matched by header name (accents and case ignored),
// products are matched by name (case-insensitive): existing ones are updated, new ones created.
export const PRODUCT_COLUMNS = [
  { key: 'name', header: 'Nombre', width: 36 },
  { key: 'description', header: 'Descripción', width: 48 },
  { key: 'price', header: 'Precio sugerido', width: 18 },
  { key: 'active', header: 'Activo', width: 10 },
  { key: 'loanable', header: 'Equipo de préstamo', width: 20 },
  { key: 'stock', header: 'Existencias', width: 14 },
] as const
export const EXAMPLE_PREFIX = 'EJEMPLO'

const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const yes = (value: XlsxValue) => value === true || ['si', 'sí', 's', 'true', '1', 'x', 'verdadero', 'yes'].includes(normalize(value))
const no = (value: XlsxValue) => value === false || ['no', 'n', 'false', '0', 'falso'].includes(normalize(value))
const boolLabel = (value: boolean) => value ? 'Sí' : 'No'

type ProductRow = { id: string; name: string; description: string | null; price: Prisma.Decimal; active: boolean; loanable: boolean; stock: number }

export function exportProductsXlsx(products: ProductRow[]) {
  return xlsx({
    name: 'Productos',
    columns: PRODUCT_COLUMNS.map(column => ({ header: column.header, width: column.width })),
    rows: products.map(product => [product.name, product.description || '', Number(product.price), boolLabel(product.active), boolLabel(product.loanable), product.stock]),
  })
}

/** Import template: the headers plus example rows, which the importer ignores. */
export function productTemplateXlsx() {
  return xlsx({
    name: 'Productos',
    columns: PRODUCT_COLUMNS.filter(column => column.key !== 'stock').map(column => ({ header: column.header, width: column.width })),
    rows: [
      [`${EXAMPLE_PREFIX} - Impresora POS térmica 80 mm`, 'Puerto de red, 1 año de garantía', 520000, 'Sí', 'Sí'],
      [`${EXAMPLE_PREFIX} - Instalación y configuración`, 'Servicio en sitio, hasta 2 horas', 80000, 'Sí', 'No'],
      [`${EXAMPLE_PREFIX} - Cajón monedero (descontinuado)`, '', 150000, 'No', 'No'],
      [],
      ['Instrucciones: borra o deja las filas que empiezan por "EJEMPLO" (se omiten). Nombre y Precio sugerido son obligatorios; Activo y Equipo de préstamo aceptan Sí/No. Los productos se identifican por su nombre: si ya existe se actualiza (las celdas vacías conservan el valor actual), si no se crea. Las existencias no se importan: usa Inventario.'],
    ],
  })
}

export type ImportAction = 'create' | 'update' | 'skip' | 'error'
export interface ImportRow { row: number; name: string; description: string; price: number | null; active: boolean; loanable: boolean; action: ImportAction; message?: string; productId?: string; changes?: string[] }

/** Parses the workbook and decides what each row would do, without writing. */
export async function planProductImport(buffer: Buffer): Promise<{ rows: ImportRow[]; summary: Record<ImportAction, number> }> {
  const sheet = readXlsx(buffer)
  const headerIndex = sheet.findIndex(row => row.some(cell => normalize(cell) === 'nombre'))
  if (headerIndex < 0) throw new Error('No se encontró la fila de encabezados (debe incluir "Nombre"). Descarga la plantilla para ver el formato.')
  const headers = sheet[headerIndex].map(normalize)
  const col = (...names: string[]) => headers.findIndex(header => names.includes(header))
  const columns = { name: col('nombre', 'producto'), description: col('descripcion', 'detalle'), price: col('precio sugerido', 'precio', 'valor'), active: col('activo', 'estado'), loanable: col('equipo de prestamo', 'prestamo') }
  if (columns.price < 0) throw new Error('Falta la columna "Precio sugerido".')
  const existing = await prisma.product.findMany({ select: { id: true, name: true, description: true, price: true, active: true, loanable: true } })
  const byName = new Map(existing.map(product => [normalize(product.name), product]))
  const seen = new Set<string>()
  const rows: ImportRow[] = []
  for (let index = headerIndex + 1; index < sheet.length; index++) {
    const cells = sheet[index]
    if (!cells || cells.every(cell => cell === null || cell === '')) continue
    const cell = (position: number) => position >= 0 ? cells[position] ?? null : null
    const name = String(cell(columns.name) ?? '').trim()
    const description = String(cell(columns.description) ?? '').trim()
    const rawPrice = cell(columns.price)
    const price = rawPrice === null || rawPrice === '' ? null : typeof rawPrice === 'number' ? rawPrice : Number(String(rawPrice).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
    const activeCell = cell(columns.active), loanableCell = cell(columns.loanable)
    const blank = (value: XlsxValue) => value === null || value === ''
    // New products default to active and not loanable; for existing ones a blank cell keeps the current value.
    const current = byName.get(normalize(name))
    const active = blank(activeCell) ? (current ? current.active : true) : yes(activeCell) ? true : no(activeCell) ? false : true
    const loanable = blank(loanableCell) ? (current ? current.loanable : false) : yes(loanableCell)
    const descriptionBlank = columns.description < 0 || blank(cell(columns.description))
    const base: ImportRow = { row: index + 1, name, description: descriptionBlank && current ? (current.description || '') : description, price, active, loanable, action: 'skip' }
    if (!name) { rows.push({ ...base, action: 'error', message: 'Falta el nombre' }); continue }
    if (name.toUpperCase().startsWith(EXAMPLE_PREFIX) || normalize(name).startsWith('instrucciones')) { rows.push({ ...base, message: 'Fila de ejemplo o instrucciones' }); continue }
    if (name.length > 200) { rows.push({ ...base, action: 'error', message: 'El nombre supera 200 caracteres' }); continue }
    if (description.length > 1000) { rows.push({ ...base, action: 'error', message: 'La descripción supera 1000 caracteres' }); continue }
    if (price === null || !Number.isFinite(price) || price < 0 || price > 99999999999) { rows.push({ ...base, action: 'error', message: 'Precio inválido' }); continue }
    if (activeCell !== null && activeCell !== '' && !yes(activeCell) && !no(activeCell)) { rows.push({ ...base, action: 'error', message: 'Activo debe ser Sí o No' }); continue }
    if (seen.has(normalize(name))) { rows.push({ ...base, action: 'error', message: 'Nombre repetido en el archivo' }); continue }
    seen.add(normalize(name))
    if (!current) { rows.push({ ...base, action: 'create' }); continue }
    const changes: string[] = []
    if ((current.description || '') !== base.description) changes.push('descripción')
    if (Math.round(Number(current.price) * 100) !== Math.round(price * 100)) changes.push('precio')
    if (current.active !== active) changes.push(active ? 'activar' : 'desactivar')
    if (current.loanable !== loanable) changes.push('equipo de préstamo')
    rows.push({ ...base, productId: current.id, action: changes.length ? 'update' : 'skip', changes, message: changes.length ? undefined : 'Sin cambios' })
  }
  const summary = { create: 0, update: 0, skip: 0, error: 0 }
  for (const row of rows) summary[row.action]++
  return { rows, summary }
}

/** Applies a plan: creates and updates in one transaction. Rows with errors are never applied. */
export async function applyProductImport(rows: ImportRow[], actorId: string) {
  const pending = rows.filter(row => row.action === 'create' || row.action === 'update')
  await prisma.$transaction(async tx => {
    for (const row of pending) {
      const data = { description: row.description || null, price: priceDecimal(row.price || 0), active: row.active, loanable: row.loanable }
      if (row.action === 'create') {
        const created = await tx.product.create({ data: { name: row.name, ...data } })
        await audit(tx, actorId, created.id, 'products:imported-created')
      } else if (row.productId) {
        await tx.product.update({ where: { id: row.productId }, data })
        await audit(tx, actorId, row.productId, 'products:imported-updated')
      }
    }
  })
  return { created: pending.filter(row => row.action === 'create').length, updated: pending.filter(row => row.action === 'update').length }
}
