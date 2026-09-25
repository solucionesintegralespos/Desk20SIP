import { prisma } from '@/lib/prisma';
import { serviceUser, serviceError } from '@/lib/support/server';
import { serviceDay } from '@/lib/support/order-display';
import { scheduledAt, type ScheduleEvent } from '@/lib/schedule';

export const dynamic = 'force-dynamic';
// Planned tasks of the signed-in engineer for today and tomorrow (Bogotá dates).
// The browser compares the returned instants with its clock between polls.
export async function GET() {
  try {
    const user = await serviceUser();
    const now = new Date();
    const dates = [serviceDay(now.toISOString()), serviceDay(new Date(now.getTime() + 86400000).toISOString())];
    const records = await prisma.serviceRecord.findMany({
      where: { kind: 'schedule', techId: user.id, AND: [
        { payload: { path: ['status'], equals: 'planned' } },
        { OR: dates.map(date => ({ payload: { path: ['date'], equals: date } })) },
      ] },
      select: { id: true, clientId: true, payload: true },
    });
    const clientIds = Array.from(new Set(records.map(record => record.clientId).filter((id): id is string => !!id)));
    const clients = clientIds.length ? await prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, email: true } }) : [];
    const tasks = records.map(record => {
      const event = record.payload as unknown as ScheduleEvent;
      const client = clients.find(c => c.id === record.clientId);
      return { id: record.id, title: event.title, date: event.date, start: event.start, scheduledAt: scheduledAt(event.date, event.start).toISOString(), clientName: client ? client.name || client.email : null };
    }).filter(task => Number.isFinite(Date.parse(task.scheduledAt))).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return Response.json({ tasks, today: dates[0] });
  } catch (error) { return serviceError(error); }
}
