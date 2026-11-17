import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { FARES_PAID_UNTIL_KEY, eventFares, eventTechIds, fareSummary, hasFare, type FareStatus, type ScheduleEvent, type TechFare } from '@/lib/schedule'

// Pasajes live inside the schedule event payload (ServiceRecord kind 'schedule'). Every engineer
// assigned to the event has their own fare of the same value (`fares`, by engineer id).
// The "paid until" date is a setting: events on or before it are frozen.
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function getFaresPaidUntil(db: Pick<Prisma.TransactionClient, 'setting'> = prisma) {
  const setting = await db.setting.findUnique({ where: { key: FARES_PAID_UNTIL_KEY } })
  return setting && DATE.test(setting.value) ? setting.value : null
}

export type FareRecord = ScheduleEvent & { techIds: string[]; fares: Record<string, TechFare> }

/** Events with at least one engineer's fare in the date range (inclusive, Bogotá dates), optionally only fares of one engineer. */
export async function listFares(from: string, to: string, techId?: string): Promise<FareRecord[]> {
  const records = await prisma.$queryRaw<{ id: string; revision: number; payload: Prisma.JsonValue }[]>(Prisma.sql`
    SELECT "id", "revision", "payload" FROM "ServiceRecord"
    WHERE "kind" = 'schedule' AND "payload"->>'date' >= ${from} AND "payload"->>'date' <= ${to}
      AND COALESCE(("payload"->>'fareCents')::numeric, 0) > 0
    ORDER BY "payload"->>'date' ASC, "payload"->>'start' ASC`)
  return records
    .map(record => ({ ...(record.payload as unknown as ScheduleEvent), id: record.id, revision: record.revision }))
    .filter(hasFare)
    .map(event => {
      const fares = eventFares(event)
      return { ...event, techIds: eventTechIds(event), fares: techId ? Object.fromEntries(Object.entries(fares).filter(([id]) => id === techId)) : fares }
    })
    .filter(event => Object.keys(event.fares).length > 0)
}

export const fareStatusOf = (event: { fareStatus?: FareStatus | null }): FareStatus => event.fareStatus || 'pending'

/** Marks every pending/accepted fare (per engineer) dated on or before `until` as paid and stores the cutoff. */
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
      const fares = eventFares(payload)
      const unpaid = Object.entries(fares).filter(([, fare]) => fare.status !== 'paid')
      if (!unpaid.length) continue
      for (const [id] of unpaid) fares[id] = { status: 'paid', paidAt }
      const updated = await tx.serviceRecord.updateMany({ where: { id: record.id, revision: record.revision }, data: { payload: { ...payload, fares, ...fareSummary(fares) } as unknown as Prisma.InputJsonValue, revision: { increment: 1 } } })
      if (!updated.count) continue
      count += unpaid.length; totalCents += (payload.fareCents || 0) * unpaid.length
      await tx.serviceAuditEvent.create({ data: { actorId, entityId: record.id, action: 'fares:paid' } })
    }
    const previous = await getFaresPaidUntil(tx)
    const cutoff = previous && previous > until ? previous : until
    await tx.setting.upsert({ where: { key: FARES_PAID_UNTIL_KEY }, create: { key: FARES_PAID_UNTIL_KEY, value: cutoff }, update: { value: cutoff } })
    return { count, totalCents, paidUntil: cutoff }
  })
}
