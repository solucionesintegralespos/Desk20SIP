import type { Template, ChecklistRun, WorkOrder, Evidence } from './model';
import { checklistErrors, orderErrors } from './rules';
function assert(condition: unknown, message: string): asserts condition { if (!condition)
    throw Error(message); }
export function validText(value: unknown, max = 20000): value is string { return typeof value === 'string' && value.length <= max; }
export function validateTemplate(t: Template) {
    assert(validText(t.name, 200) && t.name.trim(), 'El nombre de plantilla es obligatorio.');
    assert(typeof t.active === 'boolean', 'Estado de plantilla inválido.');
    assert(Array.isArray(t.items) && t.items.length > 0 && t.items.length <= 100, 'Agrega entre 1 y 100 pasos.');
    const ids = new Set<string>();
    for (const i of t.items) {
        assert(i && validText(i.id, 100) && i.id && !ids.has(i.id), 'Identificador de paso inválido o repetido.');
        ids.add(i.id);
        assert(validText(i.label, 500) && i.label.trim() && validText(i.category, 200) && i.category.trim(), 'Completa categoría y descripción de cada paso.');
        assert([i.required, i.evidenceRequired, i.isBackup].every(v => typeof v === 'boolean'), 'Controles de paso inválidos.');
    }
}
export function validateEvidence(f: Evidence) {
    assert(f && validText(f.id, 100) && validText(f.name, 255) && f.name.trim(), 'Evidencia inválida.');
    assert(['image/png', 'image/jpeg', 'application/pdf'].includes(f.type), 'Adjunta JPG, PNG o PDF.');
    assert(typeof f.dataUrl === 'string' && f.dataUrl.startsWith(`data:${f.type};base64,`), 'Contenido de evidencia inválido.');
    const encoded = f.dataUrl.split(',')[1];
    assert(encoded && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded) && Buffer.from(encoded, 'base64').length <= 2 * 1024 * 1024, 'La evidencia debe tener máximo 2 MB.');
    const bytes = Buffer.from(encoded, 'base64');
    assert(f.type === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : f.type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216, 'El archivo no coincide con su formato.');
}
export function validateChecklist(run: ChecklistRun) {
    assert(Array.isArray(run.responses) && run.responses.length > 0 && run.responses.length <= 100, 'Respuestas inválidas.');
    for (const r of run.responses) {
        assert(r && typeof r.checked === 'boolean' && validText(r.notes) && Array.isArray(r.evidence) && r.evidence.length <= 3, 'Respuesta inválida; máximo 3 evidencias por paso.');
        r.evidence.forEach(validateEvidence);
    }
    if (run.status === 'completed') {
        const errors = checklistErrors(run);
        assert(!errors.length, errors[0]);
    }
}
export function validateOrder(order: WorkOrder) {
    for (const field of ['diagnosis', 'workDone', 'observations', 'signerName'] as const)
        assert(validText(order[field]), `Campo inválido: ${field}`);
    assert(typeof order.consent === 'boolean', 'Aceptación inválida.');
    assert(!order.signature || (typeof order.signature === 'string' && order.signature.length < 500000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(order.signature) && Buffer.from(order.signature.split(',')[1], 'base64').subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))), 'Firma inválida.');
    if (order.status === 'completed') {
        const errors = orderErrors(order);
        assert(!errors.length, errors[0]);
    }
}
