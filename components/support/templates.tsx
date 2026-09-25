'use client';
import { can } from '@/lib/support/permissions';
import { useState } from 'react';
import { Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from './ui';
import { Input } from './ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui';
import { toast } from 'react-hot-toast';
import { Field, Check } from './fields';
import { useSupport, uid } from '@/lib/support/context';
import type { Template } from '@/lib/support/model';
export function Templates() {
    const { state, save, user } = useSupport();
    const [draft, setDraft] = useState<Template | null>(null);
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState('');
    const visibleTemplates = state.templates.filter(t => t.name.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));
    const readOnly = !!draft && (!can(user, 'templates', state.templates.some(r => r.id === draft.id) ? 'update' : 'create'));
    return <><div className="page-heading templates-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Plantillas de procesos</h1><p className="text-sm text-slate-500">Los cambios se aplican a los nuevos checklists.</p></div><Button size="sm" disabled={!can(user, 'templates', 'create')} onClick={() => setDraft({ id: uid(), name: '', version: 0, active: true, items: [] })}><Plus size={16} /> Nueva plantilla</Button></div>
    <div className="templates-toolbar"><span className="text-sm text-slate-500">{state.templates.length} plantillas</span>{state.templates.length > 5 && <Input aria-label="Buscar plantillas" placeholder="Buscar plantilla…" value={query} onChange={e => setQuery(e.target.value)} />}</div>
    <div className="templates-list" role="region" aria-label="Plantillas de procesos" tabIndex={0}><ul>{visibleTemplates.map(t => <li className="template-row" key={t.id}><div className="template-info"><h2>{t.name}</h2><p className="text-xs text-slate-500">Versión {t.version} · {t.items.length} {t.items.length === 1 ? 'paso' : 'pasos'}</p></div><span className={`template-status ${t.active ? 'is-active' : ''}`}>{t.active ? 'Activa' : 'Inactiva'}</span><Button size="sm" variant="outline" aria-label={`Editar plantilla ${t.name}`} onClick={() => setDraft(structuredClone(t))}>Editar</Button></li>)}</ul>{!visibleTemplates.length && <p className="p-4 text-sm text-slate-500">{state.templates.length ? 'No se encontraron plantillas.' : 'Todavía no hay plantillas. Crea la primera para comenzar.'}</p>}</div><Dialog open={!!draft} onOpenChange={v => { if (!v)
        setDraft(null); }}><DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Constructor de checklist</DialogTitle><DialogDescription>Ordena los pasos y define los controles de cada proceso.</DialogDescription></DialogHeader>{draft && <form className="detail-stack" onSubmit={async (e) => { e.preventDefault(); if (readOnly)
        return; if (!draft.items.length) {
        toast.error('Agrega al menos un paso.');
        return;
    } setBusy(true); try {
        await save('templates', { ...draft, version: draft.version + 1 });
        setDraft(null);
        toast.success('Versión guardada');
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}><fieldset disabled={readOnly} className="detail-stack"><Field label="Nombre del servicio"><Input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></Field><Check checked={draft.active} onChange={active => setDraft({ ...draft, active })} label="Disponible para nuevos checklists"/>{draft.items.map((item, index) => <div key={item.id} className="check-row"><div className="form-grid"><Field label="Categoría"><Input required value={item.category} onChange={e => setDraft({ ...draft, items: draft.items.map(i => i.id === item.id ? { ...i, category: e.target.value } : i) })}/></Field><Field label={`Paso ${index + 1}`}><Input required value={item.label} onChange={e => setDraft({ ...draft, items: draft.items.map(i => i.id === item.id ? { ...i, label: e.target.value } : i) })}/></Field></div><div className="flex flex-wrap gap-4 mt-4">{(['required', 'isBackup'] as const).map((key, k) => <Check key={key} checked={item[key]} label={['Obligatorio', 'Control de backup'][k]} onChange={v => setDraft({ ...draft, items: draft.items.map(i => i.id === item.id ? { ...i, [key]: v } : i) })}/>)}</div><div className="flex gap-2 mt-3">{[-1, 1].map(delta => <Button type="button" key={delta} size="icon" variant="outline" aria-label={delta < 0 ? 'Subir paso' : 'Bajar paso'} disabled={index + delta < 0 || index + delta >= draft.items.length} onClick={() => { const items = [...draft.items]; [items[index], items[index + delta]] = [items[index + delta], items[index]]; setDraft({ ...draft, items }); }}>{delta < 0 ? <ArrowUp /> : <ArrowDown />}</Button>)}<Button type="button" variant="ghost" onClick={() => setDraft({ ...draft, items: draft.items.filter(i => i.id !== item.id) })}>Quitar paso</Button></div></div>)}<Button type="button" variant="outline" onClick={() => setDraft({ ...draft, items: [...draft.items, { id: uid(), category: 'General', label: '', required: true, evidenceRequired: false, isBackup: false }] })}><Plus /> Agregar paso</Button><Button type="submit" disabled={busy}>Guardar nueva versión</Button></fieldset></form>}</DialogContent></Dialog></>;
}
