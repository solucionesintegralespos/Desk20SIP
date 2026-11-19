import { accountingUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { bulkSchema, bulkBillingAction } from '@/lib/accounting/billing'

export const dynamic = 'force-dynamic'

// Bulk payment or edit of the selected accounts. Each account is processed on its own, so paid,
// voided or missing accounts are reported as skipped/error while the rest go through.
export async function POST(request: Request) {
  try {
    const user = await accountingUser()
    const parsed = bulkSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const results = await bulkBillingAction(parsed.data, user.id)
    return Response.json({
      results,
      done: results.filter(result => result.status === 'done').length,
      skipped: results.filter(result => result.status === 'skipped').length,
      failed: results.filter(result => result.status === 'error').length,
    })
  } catch (error) { return serviceError(error) }
}
