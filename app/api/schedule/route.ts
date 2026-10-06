import { prisma } from '@/lib/prisma';
import { serviceUser, serviceError, ServiceError } from '@/lib/support/server';
import { eventSchema, eventTechIds, repeatSchema, repeatDates, repeatConflict } from '@/lib/schedule';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await serviceUser();
    const [records, engineers, clients] = await Promise.all([
      prisma.serviceRecord.findMany({ where: { kind: 'schedule' }, orderBy: { createdAt: 'asc' } }),
      prisma.user.findMany({ where: { role: { in: ['ADMIN', 'AGENT'] } }, select: { id: true, name: true, email: true, avatar: true }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: { role: 'CUSTOMER' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
    ]);
    return Response.json({ events: records.map(record => ({ ...record.payload as object, id: record.id, revision: record.revision })), engineers, clients });
  } catch (error) { return serviceError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await serviceUser();
    const body = await request.json();
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) throw new ServiceError(parsed.error.issues[0].message);
    const techIds = Array.from(new Set(eventTechIds(parsed.data)));
    const event = { ...parsed.data, techId: techIds[0], techIds };
    const technicians = await prisma.user.count({ where: { id: { in: techIds }, role: { in: ['ADMIN', 'AGENT'] } } });
    if (technicians !== techIds.length) throw new ServiceError('Ingeniero no válido');
    if (event.clientId && !await prisma.user.findFirst({ where: { id: event.clientId, role: 'CUSTOMER' } })) throw new ServiceError('Cliente no válido');
    // A new event can be repeated weekly or monthly until December 31; dates where an engineer
    // already has an event at that time, or is on vacation, are skipped.
    if (!body.id && body.repeat) {
      const repeat = repeatSchema.safeParse(body.repeat);
      if (!repeat.success) throw new ServiceError('Repetición no válida');
      const result = await prisma.$transaction(async tx => {
        const existing = await tx.serviceRecord.findMany({ where: { kind: 'schedule', payload: { path: ['date'], string_starts_with: event.date.slice(0, 4) } }, select: { payload: true } });
        const occupied = existing.map(record => record.payload as unknown as { date: string; start: string; status: string; techId: string; techIds?: string[] });
        const seriesId = randomUUID(), created: string[] = [], skipped: { date: string; reason: 'vacation' | 'time' }[] = [];
        for (const date of repeatDates(event.date, repeat.data)) {
          const reason = repeatConflict(occupied, date, event.start, techIds);
          if (reason) { skipped.push({ date, reason }); continue; }
          const id = randomUUID(), payload = { ...event, date, seriesId };
          await tx.serviceRecord.create({ data: { id, kind: 'schedule', payload, techId: event.techId, clientId: event.clientId } });
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
        const result = await tx.serviceRecord.updateMany({ where: { id, kind: 'schedule', revision: body.revision }, data: { payload: event, techId: event.techId, clientId: event.clientId, revision: { increment: 1 } } });
        if (!result.count) throw new ServiceError('El evento cambió. Recarga la programación antes de editarlo.', 409);
      } else {
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
