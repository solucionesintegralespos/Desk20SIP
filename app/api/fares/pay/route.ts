import { accountingUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { canUseAccounting, isAdmin } from '@/lib/roles'
import { markFaresPaidUntil } from '@/lib/fares'
import { serviceDay } from '@/lib/support/order-display'

export const dynamic = 'force-dynamic'

// Marks every pending/accepted fare up to a date as paid and freezes fares up to that date.
export async function POST(request: Request) {
  try {
    const user = await accountingUser()
    if (!canUseAccounting(user.role) && !isAdmin(user.role)) throw new ServiceError('Solo administración y contabilidad gestionan los pasajes', 403)
    const body = await readJson(request)
    const until = typeof body.until === 'string' ? body.until : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new ServiceError('Selecciona la fecha hasta la que se pagaron los pasajes')
    if (until > serviceDay(new Date().toISOString())) throw new ServiceError('La fecha de pago no puede ser futura')
    const result = await markFaresPaidUntil(until, user.id)
    return Response.json(result)
  } catch (error) { return serviceError(error) }
}
