import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError } from '@/lib/accounting/server'
import { exportProductsXlsx } from '@/lib/accounting/product-import'
import { XLSX_TYPE } from '@/lib/xlsx'

export const dynamic = 'force-dynamic'

// Whole catalog as an Excel workbook (same columns the import accepts, plus stock for reference).
export async function GET() {
  try {
    await accountingUser()
    const products = await prisma.product.findMany({ select: { id: true, name: true, description: true, price: true, active: true, loanable: true, stock: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date())
    return new Response(new Uint8Array(exportProductsXlsx(products)), { headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="catalogo-productos-${date}.xlsx"`,
      'Cache-Control': 'private, no-store',
    } })
  } catch (error) { return serviceError(error) }
}
