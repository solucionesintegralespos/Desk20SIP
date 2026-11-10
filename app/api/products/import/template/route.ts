import { accountingUser, serviceError } from '@/lib/accounting/server'
import { productTemplateXlsx } from '@/lib/accounting/product-import'
import { XLSX_TYPE } from '@/lib/xlsx'

export const dynamic = 'force-dynamic'

// Import template with the expected headers and example rows (ignored by the importer).
export async function GET() {
  try {
    await accountingUser()
    return new Response(new Uint8Array(productTemplateXlsx()), { headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': 'attachment; filename="plantilla-productos.xlsx"',
      'Cache-Control': 'private, no-store',
    } })
  } catch (error) { return serviceError(error) }
}
