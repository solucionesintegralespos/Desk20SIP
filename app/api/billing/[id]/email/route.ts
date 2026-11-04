import { accountingUser, serviceError } from '@/lib/accounting/server'
import { sendBillingEmail } from '@/lib/accounting/email'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    return Response.json({ email: await sendBillingEmail(params.id, user.id) })
  } catch (error) { return serviceError(error) }
}
