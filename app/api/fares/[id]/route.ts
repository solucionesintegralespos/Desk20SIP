import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { staffUser, serviceError, ServiceError, readJson } from '@/lib/accounting/server'
import { canUseAccounting, isAdmin } from '@/lib/roles'
import { fareStatusOf } from '@/lib/fares'
import type { ScheduleEvent } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

// Accept a fare or remove it from the event. Paid fares are frozen.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await staffUser()
    if (!canUseAccounting(user.role) && !isAdmin(user.role)) throw new ServiceError('Solo administración y contabilidad gestionan los pasajes', 403)
    const body = await readJson(request)
    if (!['accept', 'remove'].includes(body.action) || !Number.isInteger(body.revision)) throw new ServiceError('Operación inválida')
    await prisma.$transaction(async tx => {
      const record = await tx.serviceRecord.findUnique({ where: { id: params.id }, select: { kind: true, revision: true, payload: true } })
      if (!record || record.kind !== 'schedule') throw new ServiceError('El evento no existe', 404)
      const event = record.payload as unknown as ScheduleEvent
      if (!event.fareCents || event.fareCents <= 0) throw new ServiceError('El evento no tiene pasaje', 409)
      const status = fareStatusOf(event)
      if (status === 'paid') throw new ServiceError(body.action === 'remove' ? 'Un pasaje pagado no se puede eliminar' : 'El pasaje ya fue pagado', 409)
      let payload: Record<string, unknown>
      if (body.action === 'accept') {
        if (status !== 'pending') throw new ServiceError('El pasaje ya fue aceptado', 409)
        payload = { ...event, fareStatus: 'accepted' }
      } else {
        const { fareCents: _c, fareReason: _r, fareStatus: _s, farePaidAt: _p, ...rest } = event
        payload = { ...rest, fareCents: null, fareReason: '' }
      }
      const updated = await tx.serviceRecord.updateMany({ where: { id: params.id, kind: 'schedule', revision: body.revision }, data: { payload: payload as Prisma.InputJsonValue, revision: { increment: 1 } } })
      if (!updated.count) throw new ServiceError('El evento cambió. Recarga el reporte.', 409)
      await tx.serviceAuditEvent.create({ data: { actorId: user.id, entityId: params.id, action: body.action === 'accept' ? 'fares:accepted' : 'fares:removed' } })
    })
    return Response.json({ ok: true })
  } catch (error) { return serviceError(error) }
}
