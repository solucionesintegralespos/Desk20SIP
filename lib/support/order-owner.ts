import type { Prisma } from '@prisma/client';
import type { WorkOrder } from './model';

// Older orders allowed assignment to someone other than their creator.
export async function orderCreator(db: Pick<Prisma.TransactionClient, 'serviceAuditEvent'>, record: { id: string; techId: string | null; payload: Prisma.JsonValue }) {
    const payload = record.payload as unknown as WorkOrder;
    if (payload.createdById) return payload.createdById;
    const created = await db.serviceAuditEvent.findFirst({
        where: { entityId: record.id, action: { in: ['orders:created', 'orders:completed'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { actorId: true },
    });
    return created?.actorId || record.techId;
}
