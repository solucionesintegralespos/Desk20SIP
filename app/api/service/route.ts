import { prisma } from '@/lib/prisma';
import { serviceUser, serviceError } from '@/lib/support/server';
import { createSeed } from '@/lib/support/seed';
import { serviceList } from '@/lib/support/list';
import { dailyRange } from '@/lib/daily-filter';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    try {
        const user = await serviceUser();
        const params = new URL(request.url).searchParams;
        const scope = params.get('scope');
        const range = dailyRange(params.get('dateFrom'), params.get('dateTo'));
        const kinds = scope === 'templates' ? ['templates'] : scope === 'orders' ? ['orders', 'checklists'] : scope === 'checklists' ? ['checklists', 'templates'] : ['orders','checklists','templates'];
        const [records, customers, staff, tickets] = await Promise.all([
            serviceList(kinds,user,range),
            scope === 'templates' ? [] : prisma.user.findMany({ where: { role: 'CUSTOMER' }, select: { id: true, name: true, email: true, phone: true, location: true } }),
            scope === 'templates' ? [] : prisma.user.findMany({ where: { role: { in: ['ADMIN', 'AGENT'] } }, select: { id: true, name: true, email: true, role: true } }),
            scope && scope !== 'orders' ? [] : prisma.ticket.findMany({ where: { createdAt: { gte: range.gte, lt: range.lt }, ...(user.role === 'ADMIN' ? {} : { assignments: { some: { userId: user.id } } }) }, select: { id: true, number: true, customerId: true, subject: true } })
        ]);
        const mapUser = (u: typeof user) => ({ ...u, name: u.name || u.email || 'Sin nombre', email: u.email || '', role: u.role === 'ADMIN' ? 'admin' : 'tech' });
        const collect = (kind: string) => records.filter(r => r.kind === kind).map(r => ({ ...r.payload as object, _revision: r.revision }));
        const templates = collect('templates');
        const storedIds = new Set(records.filter(r => r.kind === 'templates').map(r => r.id));
        return Response.json({ user: mapUser(user), state: { users: staff.map(mapUser), clients: customers.map(c => ({ id: c.id, name: c.name || c.email || 'Cliente', businessName: c.name || c.email || 'Cliente', email: c.email || '', phone: c.phone || '', city: c.location || '' })), tickets: tickets.map(t => ({ id: t.id, number: `TK-${t.number}`, clientId: t.customerId, subject: t.subject })), templates: [...templates, ...createSeed().templates.filter(t => !storedIds.has(t.id))], orders: collect('orders'), checklists: collect('checklists'), events: [], platforms: [] } });
    }
    catch (error) {
        return serviceError(error);
    }
}
