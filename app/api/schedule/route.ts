import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { serviceDay } from '@/lib/support/order-display';
import { serviceUser, serviceError, ServiceError } from '@/lib/support/server';
import { eventSchema, eventTechIds, repeatSchema, repeatDates, repeatConflict, fareLocked, type FareStatus, type ScheduleEvent } from '@/lib/schedule';
import { getFaresPaidUntil } from '@/lib/fares';
import { formatDateCO } from '@/lib/accounting/format';
import { randomUUID } from 'crypto';
import { STAFF_ROLES } from '@/lib/roles';

export const dynamic = 'force-dynamic';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Events are returned for one date range (the visible week by default) instead of the whole
// history; `include` adds a single event by id so a reminder link can open it.
export async function GET(request: Request) {
  try {
    await serviceUser();
    const params = new URL(request.url).searchParams;
    const today = serviceDay(new Date().toISOString());
    const from = DATE.test(params.get('from') || '') ? params.get('from')! : today;
    const to = DATE.test(params.get('to') || '') ? params.get('to')! : from;
    if (to < from) throw new ServiceError('Rango de fechas inválido');
    const include = params.get('include') || '';
    const [records, engineers, clients, faresPaidUntil] = await Promise.all([
      prisma.$queryRaw<{ id: string; revision: number; payload: Prisma.JsonValue }[]>(Prisma.sql`
        SELECT "id", "revision", "payload" FROM "ServiceRecord"
        WHERE "kind" = 'schedule' AND (("payload"->>'date' >= ${from} AND "payload"->>'date' <= ${to}) OR "id" = ${include})
        ORDER BY "createdAt" ASC`),
      prisma.user.findMany({ where: { role: { in: STAFF_ROLES }, active: true }, select: { id: true, name: true, email: true, avatar: true }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: { role: 'CUSTOMER' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
      getFaresPaidUntil(),
    ]);
    return Response.json({ events: records.map(record => ({ ...record.payload as object, id: record.id, revision: record.revision })), engineers, clients, from, to, faresPaidUntil });
  } catch (error) { return serviceError(error); }
}

// Fare fields as stored on the event. Status and payment date are never taken from the client.
type FareFields = { fareCents: number | null; fareReason: string; fareStatus?: FareStatus; farePaidAt?: string | null };
type StoredEvent = Partial<ScheduleEvent> & { date?: string };
const normalizeFare = (input: { fareCents?: number | null; fareReason?: string }): { fareCents: number | null; fareReason: string } => {
  const cents = typeof input.fareCents === 'number' && input.fareCents > 0 ? Math.round(input.fareCents) : null;
  const reason = (input.fareReason || '').trim();
  if (cents && !reason) throw new ServiceError('Indica el motivo del pasaje');
  return { fareCents: cents, fareReason: cents ? reason : '' };
};
const paidMessage = (paidUntil: string) => `Los pasajes hasta ${formatDateCO(`${paidUntil}T12:00:00-05:00`)} ya fueron pagados y no se pueden modificar`;

/**
 * Merges the fare of an incoming event with what is stored: events dated on or before the
 * paid-until cutoff keep their fare untouched; a changed accepted fare goes back to pending.
 */
function resolveFare(incoming: { fareCents: number | null; fareReason: string }, newDate: string, previous: StoredEvent | null, paidUntil: string | null): FareFields {
  const stored = previous ? normalizeFareLoose(previous) : null;
  const changed = !stored ? !!incoming.fareCents : stored.fareCents !== incoming.fareCents || stored.fareReason !== incoming.fareReason;
  const locked = fareLocked(newDate, paidUntil) || (!!previous?.date && fareLocked(previous.date, paidUntil));
  if (locked && changed) throw new ServiceError(paidMessage(paidUntil!));
  if (!incoming.fareCents) return { fareCents: null, fareReason: '' };
  if (!changed && previous) return { fareCents: incoming.fareCents, fareReason: incoming.fareReason, fareStatus: previous.fareStatus || 'pending', farePaidAt: previous.farePaidAt ?? null };
  return { fareCents: incoming.fareCents, fareReason: incoming.fareReason, fareStatus: 'pending', farePaidAt: null };
}
const normalizeFareLoose = (event: StoredEvent) => ({ fareCents: typeof event.fareCents === 'number' && event.fareCents > 0 ? event.fareCents : null, fareReason: event.fareCents && event.fareCents > 0 ? (event.fareReason || '').trim() : '' });

export async function POST(request: Request) {
  try {
    const actor = await serviceUser();
    const body = await request.json();
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) throw new ServiceError(parsed.error.issues[0].message);
    const techIds = Array.from(new Set(eventTechIds(parsed.data)));
    // Strip the fare fields: they are resolved against the stored record and the paid-until cutoff.
    const { fareCents: _fareCents, fareReason: _fareReason, ...rest } = parsed.data;
    const fare = normalizeFare(parsed.data);
    const base = { ...rest, techId: techIds[0], techIds };
    const technicians = await prisma.user.count({ where: { id: { in: techIds }, role: { in: STAFF_ROLES } } });
    if (technicians !== techIds.length) throw new ServiceError('Ingeniero no válido');
    if (base.clientId && !await prisma.user.findFirst({ where: { id: base.clientId, role: 'CUSTOMER' } })) throw new ServiceError('Cliente no válido');
    const paidUntil = await getFaresPaidUntil();
    // A new event can be repeated weekly or monthly until December 31; dates where an engineer
    // already has an event at that time, or is on vacation, are skipped.
    if (!body.id && body.repeat) {
      const repeat = repeatSchema.safeParse(body.repeat);
      if (!repeat.success) throw new ServiceError('Repetición no válida');
      const result = await prisma.$transaction(async tx => {
        const existing = await tx.serviceRecord.findMany({ where: { kind: 'schedule', payload: { path: ['date'], string_starts_with: base.date.slice(0, 4) } }, select: { payload: true } });
        const occupied = existing.map(record => record.payload as unknown as { date: string; start: string; status: string; techId: string; techIds?: string[] });
        const seriesId = randomUUID(), created: string[] = [], skipped: { date: string; reason: 'vacation' | 'time' }[] = [];
        for (const date of repeatDates(base.date, repeat.data)) {
          const reason = repeatConflict(occupied, date, base.start, techIds);
          if (reason) { skipped.push({ date, reason }); continue; }
          // Each occurrence carries the fare as pending, except dates already paid (no fare allowed there).
          const occurrenceFare = resolveFare(fare, date, null, paidUntil);
          const id = randomUUID(), payload = { ...base, ...occurrenceFare, date, seriesId };
          await tx.serviceRecord.create({ data: { id, kind: 'schedule', payload, techId: base.techId, clientId: base.clientId } });
          await tx.serviceAuditEvent.create({ data: { actorId: actor.id, entityId: id, action: 'schedule.create' } });
          occupied.push(payload);
          created.push(date);
        }
        if (!created.length) throw new ServiceError('No se creó ningún evento: todas las fechas tienen otro evento a la misma hora o vacaciones.', 409);
        return { seriesId, created, skipped };
      });
      return Response.json(result);
    }
    const id = typeof body.id === 'string' && body.id ? body.id : randomUUID();
    await prisma.$transaction(async tx => {
      if (body.id) {
        if (!Number.isInteger(body.revision)) throw new ServiceError('Revisión requerida');
        const stored = await tx.serviceRecord.findUnique({ where: { id }, select: { kind: true, payload: true } });
        if (!stored || stored.kind !== 'schedule') throw new ServiceError('El evento no existe', 404);
        const previous = stored.payload as unknown as StoredEvent;
        const event = { ...previous, ...base, ...resolveFare(fare, base.date, previous, paidUntil) };
        const result = await tx.serviceRecord.updateMany({ where: { id, kind: 'schedule', revision: body.revision }, data: { payload: event as unknown as Prisma.InputJsonValue, techId: event.techId, clientId: event.clientId, revision: { increment: 1 } } });
        if (!result.count) throw new ServiceError('El evento cambió. Recarga la programación antes de editarlo.', 409);
      } else {
        const event = { ...base, ...resolveFare(fare, base.date, null, paidUntil) };
        await tx.serviceRecord.create({ data: { id, kind: 'schedule', payload: event, techId: event.techId, clientId: event.clientId } });
      }
      await tx.serviceAuditEvent.create({ data: { actorId: actor.id, entityId: id, action: body.id ? 'schedule.update' : 'schedule.create' } });
    });
    return Response.json({ id });
  } catch (error) { return serviceError(error); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await serviceUser();
    const body = await request.json();
    if (typeof body.id !== 'string' || !Number.isInteger(body.revision)) throw new ServiceError('Evento no válido');
    await prisma.$transaction(async tx => {
      const result = await tx.serviceRecord.deleteMany({ where: { id: body.id, kind: 'schedule', revision: body.revision } });
      if (!result.count) throw new ServiceError('El evento cambió. Recarga la programación.', 409);
      await tx.serviceAuditEvent.create({ data: { actorId: actor.id, entityId: body.id, action: 'schedule.delete' } });
    });
    return Response.json({ ok: true });
  } catch (error) { return serviceError(error); }
}
