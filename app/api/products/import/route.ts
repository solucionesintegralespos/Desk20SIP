import { accountingUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { planProductImport, applyProductImport, type ImportRow } from '@/lib/accounting/product-import'

export const dynamic = 'force-dynamic'
const MAX_BYTES = 5 * 1024 * 1024

// Two steps: POST the workbook (multipart "file") to get the plan, then PUT the reviewed rows to apply it.
export async function POST(request: Request) {
  try {
    await accountingUser()
    const form = await request.formData().catch(() => { throw new ServiceError('Adjunta el archivo de Excel (.xlsx)') })
    const file = form.get('file')
    if (!(file instanceof File)) throw new ServiceError('Adjunta el archivo de Excel (.xlsx)')
    if (file.size > MAX_BYTES) throw new ServiceError('El archivo supera 5 MB', 413)
    if (!/\.xlsx$/i.test(file.name)) throw new ServiceError('Solo se admiten libros de Excel (.xlsx). Guarda el archivo con ese formato.')
    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.subarray(0, 2).toString() !== 'PK') throw new ServiceError('El archivo no es un libro de Excel válido')
    let plan
    try { plan = await planProductImport(buffer) } catch (error) { throw new ServiceError(error instanceof Error ? error.message : 'No se pudo leer el archivo') }
    return Response.json({ fileName: file.name, ...plan })
  } catch (error) { return serviceError(error) }
}

export async function PUT(request: Request) {
  try {
    const user = await accountingUser()
    const body = await readJson(request, 10 * 1024 * 1024)
    // Only the rows the preview marked as create/update are applied; errors and skips are ignored.
    const rows: ImportRow[] = (Array.isArray(body.rows) ? body.rows : []).filter((row: ImportRow) => row && (row.action === 'create' || row.action === 'update'))
    if (!rows.length) throw new ServiceError('No hay filas para importar')
    if (rows.length > 5000) throw new ServiceError('Máximo 5000 filas por importación')
    // Never trust the client's plan: re-validate against the current catalog from the same data.
    for (const row of rows) {
      if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200) throw new ServiceError(`Fila ${row.row}: nombre inválido`)
      if (typeof row.price !== 'number' || !Number.isFinite(row.price) || row.price < 0) throw new ServiceError(`Fila ${row.row}: precio inválido`)
      if (typeof row.description !== 'string' || row.description.length > 1000) throw new ServiceError(`Fila ${row.row}: descripción inválida`)
      if (typeof row.active !== 'boolean' || typeof row.loanable !== 'boolean') throw new ServiceError(`Fila ${row.row}: valores inválidos`)
    }
    const { rows: planned } = await planProductImport(await importBuffer(rows))
    const result = await applyProductImport(planned, user.id)
    return Response.json({ ...result, skipped: planned.filter(r => r.action === 'skip').length, errors: planned.filter(r => r.action === 'error').map(r => ({ row: r.row, message: r.message })) })
  } catch (error) { return serviceError(error) }
}

// Rebuilds a workbook from the reviewed rows so apply and preview share one code path.
async function importBuffer(rows: ImportRow[]) {
  const { xlsx } = await import('@/lib/xlsx')
  return xlsx({ name: 'Productos', columns: [{ header: 'Nombre' }, { header: 'Descripción' }, { header: 'Precio sugerido' }, { header: 'Activo' }, { header: 'Equipo de préstamo' }],
    rows: rows.filter(row => row.action === 'create' || row.action === 'update').map(row => [row.name, row.description, row.price, row.active ? 'Sí' : 'No', row.loanable ? 'Sí' : 'No']) })
}
