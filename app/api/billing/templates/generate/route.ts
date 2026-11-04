import { accountingUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { generateSchema, generateFromTemplates } from '@/lib/accounting/billing'
import { currentPeriod } from '@/lib/accounting/format'

export const dynamic = 'force-dynamic'

// Bulk generation of the selected templates; each one succeeds or fails on its own.
export async function POST(request: Request) {
  try {
    const user = await accountingUser()
    const parsed = generateSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(issue => issue.message).join('. '))
    const period = parsed.data.period || currentPeriod()
    if (period > currentPeriod()) throw new ServiceError('No se pueden generar cuentas de períodos futuros')
    const results = await generateFromTemplates(Array.from(new Set(parsed.data.templateIds)), period, user.id)
    return Response.json({ period, results })
  } catch (error) { return serviceError(error) }
}
