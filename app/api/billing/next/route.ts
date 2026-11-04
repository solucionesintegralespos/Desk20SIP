import { accountingUser, serviceError, ServiceError } from '@/lib/accounting/server'
import { peekBillingNumber } from '@/lib/accounting/billing'
import { formatBillingNumber } from '@/lib/accounting/format'

export const dynamic = 'force-dynamic'

// Number the customer's next account will receive; shown in the form before generating.
export async function GET(request: Request) {
  try {
    await accountingUser()
    const customerId = new URL(request.url).searchParams.get('customerId') || ''
    if (!customerId) throw new ServiceError('Selecciona el cliente')
    const peek = await peekBillingNumber(customerId)
    if (!peek) throw new ServiceError('Cliente no encontrado', 404)
    return Response.json({ next: peek.next, numberLabel: formatBillingNumber(peek.next), started: peek.started })
  } catch (error) { return serviceError(error) }
}
