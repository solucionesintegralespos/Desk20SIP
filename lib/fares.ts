import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { FARES_PAID_UNTIL_KEY, eventTechIds, hasFare, type FareStatus, type ScheduleEvent } from '@/lib/schedule'

// Pasajes live inside the schedule event payload (ServiceRecord kind 'schedule').
// The "paid until" date is a setting: events on or before it are frozen.
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function getFaresPaidUntil(db: Pick<Prisma.TransactionClient, 'setting'> = prisma) {
  const setting = await db.setting.findUnique({ where: { key: FARES_PAID_UNTIL_KEY } })
  return setting && DATE.test(setting.value) ? setting.value : null
}

export type FareRecord = ScheduleEvent & { techIds: string[] }

/** Events with a fare in the date range (inclusive, Bogotá dates), optionally for one engineer. */
export async function listFares(from: string, to: string, techId?: string): Promise<FareRecord[]> {
  const records = await prisma.$queryRaw<{ id: string; revision: number; payload: Prisma.JsonValue }[]>(Prisma.sql`
    SELECT "id", "revision", "payload" FROM "ServiceRecord"
    WHERE "kind" = 'schedule' AND "payload"->>'date' >= ${from} AND "payload"->>'date' <= ${to}
      AND COALESCE(("payload"->>'fareCents')::numeric, 0) > 0
    ORDER BY "payload"->>'date' ASC, "payload"->>'start' ASC`)
  return records
    .map(record => ({ ...(record.payload as unknown as ScheduleEvent), id: record.id, revision: record.revision }))
    .map(event => ({ ...event, techIds: eventTechIds(event) }))
    .filter(event => hasFare(event) && (!techId || event.techIds.includes(techId)))
}

export const fareStatusOf = (event: { fareStatus?: FareStatus | null }): FareStatus => event.fareStatus || 'pending'

/** Marks every pending/accepted fare dated on or before `until` as paid and stores the cutoff. */
export async function markFaresPaidUntil(until: string, actorId: string) {
  if (!DATE.test(until)) throw new Error('Fecha inválida')
  return prisma.$transaction(async tx => {
    const records = await tx.$queryRaw<{ id: string; revision: number; payload: Prisma.JsonValue }[]>(Prisma.sql`
      SELECT "id", "revision", "payload" FROM "ServiceRecord"
      WHERE "kind" = 'schedule' AND "payload"->>'date' <= ${until}
        AND COALESCE(("payload"->>'fareCents')::numeric, 0) > 0
        AND COALESCE("payload"->>'fareStatus', 'pending') <> 'paid'`)
    const paidAt = new Date().toISOString()
    let count = 0, totalCents = 0
    for (const record of records) {
      const payload = record.payload as unknown as ScheduleEvent
      const updated = await tx.serviceRecord.updateMany({ where: { id: record.id, revision: record.revision }, data: { payload: { ...payload, fareStatus: 'paid', farePaidAt: paidAt } as unknown as Prisma.InputJsonValue, revision: { increment: 1 } } })
      if (!updated.count) continue
      count++; totalCents += payload.fareCents || 0
      await tx.serviceAuditEvent.create({ data: { actorId, entityId: record.id, action: 'fares:paid' } })
    }
    const previous = await getFaresPaidUntil(tx)
    const cutoff = previous && previous > until ? previous : until
    await tx.setting.upsert({ where: { key: FARES_PAID_UNTIL_KEY }, create: { key: FARES_PAID_UNTIL_KEY, value: cutoff }, update: { value: cutoff } })
    return { count, totalCents, paidUntil: cutoff }
  })
}
