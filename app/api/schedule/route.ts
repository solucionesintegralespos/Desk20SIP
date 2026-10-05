import { prisma } from '@/lib/prisma';
import { serviceUser, serviceError, ServiceError } from '@/lib/support/server';
import { eventSchema, eventTechIds } from '@/lib/schedule';
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
