import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { serviceUser, serviceError, ServiceError } from '@/lib/support/server';
import { createSeed } from '@/lib/support/seed';
import { validateTemplate, validateChecklist, validateOrder, validText } from '@/lib/support/validation';
import type { Template, ChecklistRun, WorkOrder } from '@/lib/support/model';
import { orderCreator } from '@/lib/support/order-owner';
import { sendOrderCreatedEmail } from '@/lib/order-email';
type RecordData = (Template | ChecklistRun | WorkOrder) & {
    _revision?: number;
};
export async function POST(request: Request, { params }: {
    params: {
        entity: string;
    };
}) {
    try {
        const user = await serviceUser();
        const kind = params.entity;
        if (!['orders', 'checklists', 'templates'].includes(kind))
            throw new ServiceError('Proceso desconocido', 404);
        if (kind === 'templates' && user.role !== 'ADMIN')
            throw new ServiceError('Solo administradores pueden modificar plantillas', 403);
        const raw = await request.text();
        if (Buffer.byteLength(raw) > 30 * 1024 * 1024)
            throw new ServiceError('El registro excede 30 MB', 413);
        let input: RecordData;
        try {
            input = JSON.parse(raw);
        }
        catch {
            throw new ServiceError('JSON inválido');
        }
        if (!input || !validText(input.id, 100) || !input.id.trim())
            throw new ServiceError('Identificador inválido');
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.serviceRecord.findUnique({ where: { id: input.id } });
            if (existing && existing.kind !== kind)
                throw new ServiceError('Identificador usado por otro proceso', 409);
            const previous = existing?.payload as unknown as RecordData | undefined;
            const createdById = kind === 'orders' && existing ? await orderCreator(tx, existing) : user.id;
            if (existing && input._revision !== existing.revision)
                throw new ServiceError('El registro cambió. Recarga la página antes de guardar.', 409);
            if (previous && 'status' in previous && previous.status === 'completed')
                throw new ServiceError('Los documentos completados no se pueden modificar', 409);
            const now = new Date().toISOString();
            let payload: RecordData;
            let clientId: string | null = null;
            let techId: string | null = null;
            if (kind === 'templates') {
                const t = input as Template;
                try {
                    validateTemplate(t);
                }
                catch (e) {
                    throw new ServiceError((e as Error).message);
                }
                const base = previous as Template | undefined || createSeed().templates.find(t => t.id === input.id);
                payload = { id: t.id, name: t.name.trim(), active: t.active, items: t.items, version: (base?.version || 0) + 1 };
            }
            else {
                const record = input as ChecklistRun | WorkOrder;
                if (!['in_progress', 'completed'].includes(record.status) || !validText(record.serviceName, 200) || !record.serviceName.trim())
                    throw new ServiceError('Servicio y estado válidos son obligatorios');
                if (!validText(record.clientId, 100) || !validText(record.techId, 100))
                    throw new ServiceError('Cliente y responsable inválidos');
                if ((!existing && record.techId !== user.id) ||
                    (existing && record.techId !== existing.techId) ||
                    (existing && kind === 'orders' && createdById !== user.id) ||
                    (existing && kind === 'checklists' && user.role !== 'ADMIN' && existing.techId !== user.id))
                    throw new ServiceError('Solo puedes modificar tus procesos', 403);
                const [client, tech] = await Promise.all([tx.user.findUnique({ where: { id: record.clientId } }), tx.user.findUnique({ where: { id: record.techId } })]);
                if (!client || client.role !== 'CUSTOMER' || !tech || tech.role === 'CUSTOMER')
                    throw new ServiceError('Selecciona un cliente y un responsable válidos');
                clientId = record.clientId;
                techId = record.techId;
                let generatedNumber = previous && 'number' in previous ? previous.number : '';
                if (kind === 'checklists' && !existing) {
                    const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Bogota' }).format(new Date(now));
                    const counter = await tx.serviceCounter.upsert({ where: { key: `checklists:${year}` }, create: { key: `checklists:${year}`, value: 1 }, update: { value: { increment: 1 } } });
                    generatedNumber = `${year.slice(-2)}-${String(counter.value).padStart(3, '0')}`;
                }
                if (kind === 'checklists') {
                    const c = record as ChecklistRun;
                    let base: ChecklistRun;
                    if (previous) {
                        base = previous as ChecklistRun;
                        if (c.clientId !== base.clientId || c.templateId !== base.templateId)
                            throw new ServiceError('El cliente y la plantilla de un proceso iniciado no pueden cambiar');
                    }
                    else {
                        const stored = await tx.serviceRecord.findUnique({ where: { id: c.templateId } });
                        const template = stored?.kind === 'templates' ? stored.payload as unknown as Template : createSeed().templates.find(t => t.id === c.templateId);
                        if (!template?.active)
                            throw new ServiceError('Selecciona una plantilla activa');
                        base = { ...c, templateId: template.id, templateVersion: template.version, serviceName: template.name, createdAt: now, responses: template.items.map(item => ({ item, checked: false, notes: '', evidence: [] })) };
                    }
                    if (!Array.isArray(c.responses) || c.responses.length !== base.responses.length)
                        throw new ServiceError('Los pasos no coinciden con la plantilla');
                    const responses = base.responses.map(r => { const response = c.responses.find(x => x?.item?.id === r.item.id); if (!response)
                        throw new ServiceError('Falta un paso de la plantilla');
                        const evidence = previous ? r.evidence : [];
                        if (JSON.stringify(response.evidence) !== JSON.stringify(evidence))
                            throw new ServiceError('Los adjuntos de checklist no se pueden agregar ni modificar');
                        return { item: r.item, checked: response.checked, notes: response.notes, evidence }; });
                    payload = { ...base, number: generatedNumber, techId, status: c.status, responses, completedAt: c.status === 'completed' ? now : undefined };
                    try {
                        validateChecklist(payload as ChecklistRun);
                    }
                    catch (e) {
                        throw new ServiceError((e as Error).message);
                    }
                }
                else {
                    const o = record as WorkOrder;
                    if (o.ticketId) {
                        const ticket = await tx.ticket.findUnique({ where: { id: o.ticketId } });
                        if (!ticket || ticket.customerId !== clientId || user.role !== 'ADMIN' && !(await tx.ticketAssignee.findUnique({ where: { ticketId_userId: { ticketId: ticket.id, userId: user.id } } })))
                            throw new ServiceError('El ticket no corresponde al cliente o responsable');
                        // A new link must point to a ticket still in progress; an existing link is kept as is.
                        if (o.ticketId !== (previous as WorkOrder | undefined)?.ticketId && !['OPEN', 'PENDING'].includes(ticket.status))
                            throw new ServiceError('Solo puedes vincular tickets abiertos o pendientes');
                    }
                    if (o.checklistId) {
                        const checklist = await tx.serviceRecord.findUnique({ where: { id: o.checklistId } });
                        if (!checklist || checklist.kind !== 'checklists' || checklist.clientId !== clientId || user.role !== 'ADMIN' && checklist.techId !== user.id)
                            throw new ServiceError('El checklist no corresponde al cliente o responsable');
                    }
                    // The responsible technician always takes part; others must be support staff.
                    if (o.techIds !== undefined && (!Array.isArray(o.techIds) || o.techIds.length > 20 || o.techIds.some(id => !validText(id, 100))))
                        throw new ServiceError('Técnicos inválidos');
                    const techIds = Array.from(new Set([techId as string, ...(o.techIds || [])]));
                    if (await tx.user.count({ where: { id: { in: techIds }, role: { in: ['ADMIN', 'AGENT'] } } }) !== techIds.length)
                        throw new ServiceError('Selecciona técnicos válidos');
                    const serviceTime = o.startTime === undefined ? (previous as WorkOrder | undefined)?.startTime || now : o.startTime;
                    if (!validText(serviceTime, 100) || !Number.isFinite(Date.parse(serviceTime)))
                        throw new ServiceError('Selecciona una fecha y hora del servicio válidas');
                    if (o.status === 'completed' && Date.parse(serviceTime) > Date.parse(now))
                        throw new ServiceError('La fecha del servicio no puede ser futura al completar la orden');
                    payload = { id: o.id, createdById: createdById || user.id, number: generatedNumber, clientId, techId, techIds, serviceName: o.serviceName.trim(), status: o.status, ticketId: o.ticketId || undefined, checklistId: o.checklistId || undefined, startTime: new Date(serviceTime).toISOString(), diagnosis: o.diagnosis, workDone: o.workDone, observations: o.observations, signerName: o.signerName, consent: o.consent, signature: o.signature || undefined, endTime: o.status === 'completed' ? now : undefined, signedAt: o.status === 'completed' ? now : undefined };
                    try {
                        validateOrder(payload);
                    }
                    catch (e) {
                        throw new ServiceError((e as Error).message);
                    }
                }
            }
            const data = { kind, clientId, techId, payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue };
            if (existing) {
                const update = await tx.serviceRecord.updateMany({ where: { id: input.id, revision: existing.revision }, data: { ...data, revision: { increment: 1 } } });
                if (!update.count)
                    throw new ServiceError('El registro cambió. Recarga la página.', 409);
            }
            else
                await tx.serviceRecord.create({ data: { ...data, id: input.id } });
            if (kind === 'orders' && 'status' in payload && payload.status === 'completed') {
                const order = payload as WorkOrder;
                if (order.ticketId) {
                    const closed = await tx.ticket.updateMany({
                        where: { id: order.ticketId, status: { in: ['OPEN', 'PENDING'] } },
                        data: { status: 'CLOSED', closedById: user.id, closedAt: new Date() },
                    });
                    if (closed.count) await tx.message.create({ data: {
                        ticketId: order.ticketId, authorId: user.id, type: 'SYSTEM', isInternal: false, attachments: [],
                        content: `Ticket cerrado automáticamente al confirmar la orden de servicio: ${order.serviceName}. Trabajo realizado: ${order.workDone}`,
                    } });
                }
            }
            await tx.serviceAuditEvent.create({ data: { actorId: user.id, entityId: input.id, action: `${kind}:${'status' in payload && payload.status === 'completed' ? 'completed' : existing ? 'updated' : 'created'}` } });
            return { id: input.id, orderCreated: kind === 'orders' && !existing };
        });
        const { orderCreated, ...body } = result;
        if (!orderCreated)
            return Response.json(body);
        // The order is already committed: an email failure is reported, never rolled back.
        const email = await sendOrderCreatedEmail(body.id, user.id);
        return Response.json({ ...body, email });
    }
    catch (error) {
        return serviceError(error);
    }
}
