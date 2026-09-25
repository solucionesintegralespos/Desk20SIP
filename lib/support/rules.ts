import type { ChecklistRun, WorkOrder, State, Ticket } from './model';
export function checklistErrors(run: ChecklistRun): string[] {
    return run.responses.flatMap(r => r.item.required && !r.checked ? [`Completa: ${r.item.label}`] : []);
}
export function orderErrors(order: WorkOrder): string[] { return [!order.workDone.trim() && 'Describe el trabajo realizado.', !order.signerName.trim() && 'Registra el nombre del cliente.', !order.signature && 'Falta la firma del cliente.', !order.consent && 'El cliente debe aceptar el contenido.'].filter(Boolean) as string[]; }
export function resolveTicket(ticket: Ticket, resolution: string): Ticket { if (!resolution.trim())
    throw Error('Describe la solución antes de cerrar.'); return { ...ticket, status: 'closed', closedAt: new Date().toISOString(), resolution: resolution.trim(), firstResponseAt: ticket.firstResponseAt || new Date().toISOString(), resolvedAt: new Date().toISOString() }; }
export function completeChecklist(run: ChecklistRun): ChecklistRun { const errors = checklistErrors(run); if (errors.length)
    throw Error(errors[0]); return { ...run, status: 'completed', completedAt: new Date().toISOString() }; }
export function completeOrder(order: WorkOrder): WorkOrder { const errors = orderErrors(order); if (errors.length)
    throw Error(errors[0]); const at = new Date().toISOString(); return { ...order, status: 'completed', signedAt: at, endTime: at }; }
export function metrics(state: State) { const responded = state.tickets.filter(t => t.firstResponseAt); const backups = state.checklists.flatMap(c => c.responses).filter(r => r.item.isBackup); return { responseMinutes: responded.length ? Math.round(responded.reduce((sum, t) => sum + (Date.parse(t.firstResponseAt!) - Date.parse(t.createdAt)) / 60000, 0) / responded.length) : null, backupPercent: backups.length ? Math.round(100 * backups.filter(r => r.checked).length / backups.length) : null }; }
export function stampTicket(record: Ticket, previous?: Ticket, at = new Date().toISOString()): Ticket {
    const history = [...(previous?.closureHistory || [])];
    if (!history.length && previous?.closedAt)
        history.push(previous.closedAt);
    let closedAt = previous?.closedAt;
    if (record.status === 'closed' && previous?.status !== 'closed') {
        closedAt = at;
        history.push(at);
    }
    return { ...record, createdAt: previous?.createdAt || at, firstResponseAt: previous?.firstResponseAt || (record.status !== 'open' ? at : undefined), resolvedAt: record.status === 'closed' ? previous?.resolvedAt || at : undefined, closedAt, closureHistory: history };
}
