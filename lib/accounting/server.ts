import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getDashboardSession } from '@/lib/dashboard-data'
import { ServiceError, serviceError } from '@/lib/support/server'
import { canUseAccounting, isStaff } from '@/lib/roles'

export { ServiceError, serviceError }

/** Session user allowed into the accounting modules (administrators and Contabilidad). */
export async function accountingUser() {
  const session = await getDashboardSession()
  if (!session) throw new ServiceError('No autorizado', 401)
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, role: true, active: true } })
  if (!user || !user.active) throw new ServiceError('No autorizado', 401)
  if (!canUseAccounting(user.role)) throw new ServiceError('Acceso restringido a administración y contabilidad', 403)
  return user
}

/** Any active staff member (agents, accounting, administrators): inventory, loans and fares. */
export async function staffUser() {
  const session = await getDashboardSession()
  if (!session) throw new ServiceError('No autorizado', 401)
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, role: true, active: true, canWriteOffInventory: true } })
  if (!user || !user.active) throw new ServiceError('No autorizado', 401)
  if (!isStaff(user.role)) throw new ServiceError('Acceso restringido al personal', 403)
  return user
}

export const decimal = (value: Prisma.Decimal | number | string | null | undefined) => value == null ? null : Number(value)
export const cents = (value: Prisma.Decimal | number | string | null | undefined) => Math.round((decimal(value) ?? 0) * 100)
export const fromCentsDecimal = (centsValue: number) => new Prisma.Decimal(centsValue).div(100)

export async function readJson(request: Request, maxBytes = 1024 * 1024) {
  const raw = await request.text()
  if (Buffer.byteLength(raw) > maxBytes) throw new ServiceError('La solicitud es demasiado grande', 413)
  try { return JSON.parse(raw || '{}') } catch { throw new ServiceError('JSON inválido') }
}

/** Public base URL for links sent to customers (same rule as the service order links). */
export function publicBaseUrl() {
  return process.env.APP_PUBLIC_URL || process.env.NEXTAUTH_URL || ''
}

export async function audit(db: Pick<Prisma.TransactionClient, 'serviceAuditEvent'>, actorId: string, entityId: string, action: string) {
  await db.serviceAuditEvent.create({ data: { actorId, entityId, action } })
}

export const pdfResponse = (bytes: Uint8Array | Buffer, filename: string, disposition: 'inline' | 'attachment') => new Response(new Uint8Array(bytes), { headers: {
  'Content-Type': 'application/pdf',
  'Content-Disposition': `${disposition}; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '')}"`,
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
} })
