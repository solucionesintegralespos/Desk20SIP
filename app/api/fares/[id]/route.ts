import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { accountingUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { canUseAccounting, isAdmin } from '@/lib/roles'
import { eventFares, fareSummary, type ScheduleEvent } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

// Accept one engineer's fare or remove it from the event; the other engineers of a shared event keep theirs.
// Paid fares are frozen. When the last engineer's fare is removed, the event is left without a fare.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await accountingUser()
    if (!canUseAccounting(user.role) && !isAdmin(user.role)) throw new ServiceError('Solo administración y contabilidad gestionan los pasajes', 403)
    const body = await readJson(request)
    if (!['accept', 'remove'].includes(body.action) || !Number.isInteger(body.revision)) throw new ServiceError('Operación inválida')
    const techId = typeof body.techId === 'string' ? body.techId.trim() : ''
    if (!techId) throw new ServiceError('Indica el ingeniero del pasaje')
    await prisma.$transaction(async tx => {
      const record = await tx.serviceRecord.findUnique({ where: { id: params.id }, select: { kind: true, revision: true, payload: true } })
      if (!record || record.kind !== 'schedule') throw new ServiceError('El evento no existe', 404)
      const event = record.payload as unknown as ScheduleEvent
      const fares = eventFares(event)
      if (!Object.keys(fares).length) throw new ServiceError('El evento no tiene pasaje', 409)
      const fare = fares[techId]
      if (!fare) throw new ServiceError('Ese ingeniero no tiene pasaje en este evento', 404)
      if (fare.status === 'paid') throw new ServiceError(body.action === 'remove' ? 'Un pasaje pagado no se puede eliminar' : 'El pasaje ya fue pagado', 409)
      let payload: Record<string, unknown>
      if (body.action === 'accept') {
        if (fare.status !== 'pending') throw new ServiceError('El pasaje ya fue aceptado', 409)
        const next = { ...fares, [techId]: { status: 'accepted' as const, paidAt: null } }
        payload = { ...event, fares: next, ...fareSummary(next) }
      } else {
        const { [techId]: _removed, ...next } = fares
        const { fareCents: _c, fareReason: _r, fareStatus: _s, farePaidAt: _p, fares: _f, ...rest } = event
        payload = Object.keys(next).length ? { ...rest, fareCents: event.fareCents, fareReason: event.fareReason || '', fares: next, ...fareSummary(next) } : { ...rest, fareCents: null, fareReason: '' }
      }
      const updated = await tx.serviceRecord.updateMany({ where: { id: params.id, kind: 'schedule', revision: body.revision }, data: { payload: payload as Prisma.InputJsonValue, revision: { increment: 1 } } })
      if (!updated.count) throw new ServiceError('El evento cambió. Recarga el reporte.', 409)
      await tx.serviceAuditEvent.create({ data: { actorId: user.id, entityId: params.id, action: body.action === 'accept' ? 'fares:accepted' : 'fares:removed' } })
    })
    return Response.json({ ok: true })
  } catch (error) { return serviceError(error) }
}
