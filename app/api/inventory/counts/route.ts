import { staffUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { bulkCountSchema, performBulkCount, listBulkCounts } from '@/lib/inventory/counts'

export const dynamic = 'force-dynamic'

// Past bulk counts, newest first.
export async function GET() {
  try {
    await staffUser()
    return Response.json({ counts: await listBulkCounts() })
  } catch (error) { return serviceError(error) }
}

// Registers a physical count of the selected products and adjusts their stock in one transaction.
export async function POST(request: Request) {
  try {
    const user = await staffUser()
    const parsed = bulkCountSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const report = await performBulkCount(parsed.data, user)
    return Response.json(report, { status: 201 })
  } catch (error) { return serviceError(error) }
}
