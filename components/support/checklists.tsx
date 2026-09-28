'use client';
import { can } from '@/lib/support/permissions';
import { useState } from 'react';
import { Plus, ClipboardCheck } from 'lucide-react';
import { Button } from './ui';
import { Input } from './ui';
import { Textarea } from './ui';
import { Progress } from './ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui';
import { toast } from 'react-hot-toast';
import { Field, Pick, Check } from './fields';
import { useSupport, uid } from '@/lib/support/context';
import type { ChecklistRun, Response } from '@/lib/support/model';
import { completeChecklist } from '@/lib/support/rules';
import { serviceDate, serviceDay } from '@/lib/support/order-display';
import { SearchFilter, searchText, type SearchValue } from './SearchFilter';
import { SearchSelect, byLabel } from '@/components/ui/SearchSelect';

export function Checklists() {
    const { state, user, save, detail, dateFrom, dateTo, setDates, loading } = useSupport();
    const [create, setCreate] = useState(false);
    const [templateId, setTemplate] = useState('');
    const [clientId, setClient] = useState('');
    const [draft, setDraft] = useState<ChecklistRun | null>(null);
    const [busy, setBusy] = useState(false);
    const setDateFrom = (value: string) => setDates(value, dateTo);
    const setDateTo = (value: string) => setDates(dateFrom, value);
    const [clientFilter, setClientFilter] = useState<SearchValue>({ query: '', id: '' });
    const clientOptions = state.clients.map(client => ({
        id: client.id, label: client.businessName || client.name || client.email, description: client.email,
    })).sort(byLabel);
    const clientsById = new Map(clientOptions.map(client => [client.id, client]));
    const hasFilters = !!(dateFrom || dateTo || clientFilter.query || clientFilter.id);
    const filteredChecklists = loading ? [] : state.checklists.filter(run => {
        const client = clientsById.get(run.clientId);
        const day = serviceDay(run.completedAt || run.createdAt); return (!dateFrom || day >= dateFrom) && (!dateTo || (!!day && day <= dateTo))
            && (clientFilter.id ? run.clientId === clientFilter.id
                : searchText(client?.label || '').includes(searchText(clientFilter.query)));
    });

    const readOnly = !!draft && (draft.status === 'completed' || !can(user, 'checklists', state.checklists.some(r => r.id === draft.id) ? 'update' : 'create'));
    const edit = (id: string, patch: Partial<Response>) => setDraft(d => d && ({ ...d, responses: d.responses.map(r => r.item.id === id ? { ...r, ...patch } : r) }));
    async function persist(run: ChecklistRun) { setBusy(true); try {
        await save('checklists', run);
        setDraft(null);
        toast.success('Checklist guardado');
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <><div className="page-heading"><div><p className="eyebrow">PROCESOS TÉCNICOS</p><h1>Checklists</h1><p className="text-slate-500">Ejecuta un proceso sin crear un ticket ni una orden.</p></div><Button disabled={!can(user, 'checklists', 'create')} onClick={() => { setTemplate(state.templates.find(t => t.active)?.id || ''); setClient(state.clients[0]?.id || ''); setCreate(true); }}><Plus /> Nuevo checklist</Button></div><section aria-label="Filtros del historial" className="bg-white border border-slate-200 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
    <label className="min-w-0"><span className="block text-sm font-medium text-slate-700 mb-2">Realización desde</span><Input type="date" max={dateTo || undefined} value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="text-sm" /><span className="block text-xs text-slate-500 mt-1">En proceso: fecha de creación. Completados: fecha de finalización.</span></label>
    <label className="min-w-0"><span className="block text-sm font-medium text-slate-700 mb-2">Realización hasta</span><Input type="date" min={dateFrom || undefined} value={dateTo} onChange={event => setDateTo(event.target.value)} className="text-sm" /></label><SearchFilter label="Nombre del cliente" placeholder="Elegir o escribir un cliente..." options={clientOptions} value={clientFilter} onChange={setClientFilter} />
</section>
<div className="orders-toolbar">
    <p className="text-sm text-slate-500" role="status">{filteredChecklists.length} de {state.checklists.length} checklists</p>
    {hasFilters && <Button size="sm" variant="ghost" onClick={() => { setDates('', ''); setClientFilter({ query: '', id: '' }); }}>Limpiar filtros</Button>}
</div>
{loading && <p role="status" className="mb-4 text-sm text-slate-500">Cargando checklists de las fechas seleccionadas…</p>}
<div className="checklist-passports">{filteredChecklists.map(c => {
    const checked = c.responses.filter(r => r.checked).length;
    return <section className="panel checklist-passport" key={c.id}>
        <div className="flex justify-between items-center gap-2 flex-wrap"><p className="ticket-number">{c.number}</p><span className={'status ' + c.status}>{c.status === 'completed' ? 'Completado' : 'En proceso'}</span></div>
        <div className="min-w-0"><h2 className="text-sm">{c.serviceName}</h2><p className="text-sm text-slate-500 mt-1">{clientsById.get(c.clientId)?.label || 'Cliente no disponible'}</p></div>
        <div className="border-t border-slate-100 pt-2">
            <p className="text-xs text-slate-500">{c.completedAt ? 'Realizado' : 'Creado'} · {serviceDate(c.completedAt || c.createdAt)}</p>
            <Progress value={100 * checked / Math.max(1, c.responses.length)} />
            <p className="text-xs text-slate-500">{checked} de {c.responses.length} pasos · versión {c.templateVersion}</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            setBusy(true);
            try { setDraft(await detail('checklists', c.id)); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
        }}>Abrir checklist</Button>
    </section>;
})}</div>
{!loading && !filteredChecklists.length && <section className="panel empty"><ClipboardCheck className="mx-auto mb-4" size={32} /><h2>{hasFilters ? 'No hay checklists con estos filtros' : 'Empieza con un proceso'}</h2><p className="mt-2">{hasFilters ? 'Prueba con otra fecha o nombre de cliente.' : 'Selecciona una plantilla y registra el trabajo paso a paso.'}</p></section>}<Dialog open={create} onOpenChange={setCreate}><DialogContent><DialogHeader><DialogTitle>Nuevo checklist</DialogTitle><DialogDescription>El proceso tendrá su propio estado e historial.</DialogDescription></DialogHeader><Field label="Cliente"><SearchSelect aria-label="Cliente" placeholder="Buscar cliente…" value={clientId} onChange={setClient} options={clientOptions} /></Field><Field label="Responsable"><Input readOnly value={user.name} /></Field><Field label="Proceso"><Pick label="Proceso" value={templateId} onChange={setTemplate} options={state.templates.filter(t => t.active).map(t => ({ value: t.id, label: t.name }))}/></Field><Button disabled={!clientId || !templateId} onClick={() => { const t = state.templates.find(t => t.id === templateId)!; setDraft({ id: uid(), number: 'Se asigna al guardar', clientId, techId: user.id, templateId: t.id, templateVersion: t.version, serviceName: t.name, status: 'in_progress', createdAt: new Date().toISOString(), responses: t.items.map(item => ({ item: structuredClone(item), checked: false, notes: '', evidence: [] })) }); setCreate(false); }}>Iniciar proceso</Button></DialogContent></Dialog><Dialog open={!!draft} onOpenChange={v => { if (!v)
        setDraft(null); }}><DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{draft?.serviceName}</DialogTitle><DialogDescription>{draft?.number} · Checklist independiente</DialogDescription></DialogHeader>{draft && <div className="detail-stack"><Field label="Responsable"><Input readOnly value={state.users.find(u => u.id === draft.techId)?.name || user.name} /></Field>{draft.responses.map((r, index) => <div key={r.item.id} className="check-row">{(index === 0 || draft.responses[index - 1].item.category !== r.item.category) && <p className="eyebrow mb-4">{r.item.category}</p>}<Check checked={r.checked} disabled={readOnly} label={r.item.label + (r.item.required ? ' *' : '')} onChange={checked => edit(r.item.id, { checked })}/><Textarea className="mt-3" aria-label={`Notas: ${r.item.label}`} placeholder="Observaciones del paso" disabled={readOnly} value={r.notes} onChange={e => edit(r.item.id, { notes: e.target.value })}/>{r.evidence.map(f => <div key={f.id} className="flex items-center justify-between gap-2 mt-2 text-sm"><a className="text-blue-600 underline" href={f.dataUrl} download={f.name}>{f.name}</a></div>)}</div>)}{!readOnly && <div className="flex gap-3"><Button variant="outline" disabled={busy} onClick={() => persist(draft)}>Guardar avance</Button><Button disabled={busy} onClick={() => { try {
        void persist(completeChecklist(draft));
    }
    catch (e) {
        toast.error((e as Error).message);
    } }}>Completar checklist</Button></div>}</div>}</DialogContent></Dialog></>;
}
