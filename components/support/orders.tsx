'use client';
import { can } from '@/lib/support/permissions';
import { useEffect, useState } from 'react';
import { Plus, FileSignature, Download, UserRound, CalendarClock, Ticket, Rows3, ContactRound } from 'lucide-react';
import { Button, Input, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui';
import { toast } from 'react-hot-toast';
import { Field, Pick, Check } from './fields';
import { Signature } from './signature';
import { useSupport, uid } from '@/lib/support/context';
import type { WorkOrder } from '@/lib/support/model';
import { completeOrder } from '@/lib/support/rules';
import { serviceDate, datetimeLocal, serviceDay, orderTechIds } from '@/lib/support/order-display';
import TechnicianPicker from '@/components/tickets/TechnicianPicker';
import { SearchFilter, searchText, type SearchValue } from './SearchFilter';
import { SearchSelect, byLabel } from '@/components/ui/SearchSelect';

type OrderField = 'clientId' | 'startTime' | 'serviceName' | 'workDone' | 'signerName' | 'consent' | 'signature';
// Required to confirm an order; mirrors orderErrors() on the server so the form shows each field.
function orderFieldErrors(order: WorkOrder): Partial<Record<OrderField, string>> {
  const errors: Partial<Record<OrderField, string>> = {};
  if (!order.clientId) errors.clientId = 'Selecciona el cliente.';
  if (!order.startTime || !Number.isFinite(Date.parse(order.startTime))) errors.startTime = 'Indica la fecha y hora del servicio.';
  else if (Date.parse(order.startTime) > Date.now()) errors.startTime = 'La fecha del servicio no puede ser futura.';
  if (!order.serviceName.trim()) errors.serviceName = 'Describe el servicio realizado.';
  if (!order.workDone.trim()) errors.workDone = 'Describe el trabajo realizado.';
  if (!order.signerName.trim()) errors.signerName = 'Registra el nombre de quien recibe.';
  if (!order.consent) errors.consent = 'El cliente debe aceptar el contenido.';
  if (!order.signature) errors.signature = 'Falta la firma del cliente.';
  return errors;
}

export function Orders() {
  const { state, user, save, detail, dateFrom: date, setDates, loading } = useSupport();
  const [draft, setDraft] = useState<WorkOrder | null>(null);
  const [busy, setBusy] = useState(false);
  // Field errors are shown after the first attempt to confirm, then update as the user types.
  const [attempted, setAttempted] = useState(false);
  const [view, setView] = useState<'horizontal' | 'passport'>('horizontal');
  const setDate = (value: string) => setDates(value, value);
  const [technicianFilter, setTechnicianFilter] = useState<SearchValue>({ query: '', id: '' });
  const [clientFilter, setClientFilter] = useState<SearchValue>({ query: '', id: '' });
  const technicianOptions = state.users.map(tech => ({ id: tech.id, label: tech.name || tech.email, description: tech.email })).sort(byLabel);
  const clientOptions = state.clients.map(client => ({ id: client.id, label: client.businessName || client.name || client.email, description: client.email })).sort(byLabel);
  const techniciansById = new Map(technicianOptions.map(option => [option.id, option]));
  const clientsById = new Map(clientOptions.map(option => [option.id, option]));
  const hasFilters = !!(date || technicianFilter.query || clientFilter.query);
  const filteredOrders = loading ? [] : state.orders.filter(order => {
    const techIds = orderTechIds(order);
    const techs = techIds.map(id => techniciansById.get(id));
    const client = clientsById.get(order.clientId);
    return (!date || serviceDay(order.startTime) === date)
      && (technicianFilter.id ? techIds.includes(technicianFilter.id) : searchText(techs.map(tech => `${tech?.label || ''} ${tech?.description || ''}`).join(' ')).includes(searchText(technicianFilter.query)))
      && (clientFilter.id ? order.clientId === clientFilter.id : searchText(`${client?.label || ''} ${client?.description || ''}`).includes(searchText(clientFilter.query)));
  });
  function clearFilters() {
    setDate(''); setTechnicianFilter({ query: '', id: '' }); setClientFilter({ query: '', id: '' });
  }
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sip-orders-view');
      if (stored === 'horizontal' || stored === 'passport') setView(stored);
    } catch { /* The view remains available when browser storage is disabled. */ }
  }, []);
  function changeView(value: 'horizontal' | 'passport') {
    setView(value);
    try { localStorage.setItem('sip-orders-view', value); } catch {}
  }
  const readOnly = !!draft && (draft.status === 'completed' || (draft.createdById || draft.techId) !== user.id || !can(user, 'orders', state.orders.some(r => r.id === draft.id) ? 'update' : 'create'));
  const set = (patch: Partial<WorkOrder>) => setDraft(d => d && ({ ...d, ...patch }));
  const fieldErrors = draft && attempted && !readOnly ? orderFieldErrors(draft) : {};
  function openDraft(order: WorkOrder | null) { setAttempted(false); setDraft(order); }

  async function persist(order: WorkOrder) {
    setBusy(true);
    try {
      const { email } = await save('orders', order);
      setDraft(null);
      if (!email) toast.success('Orden guardada');
      else if (email.status === 'sent') toast.success(`Orden creada correctamente. ${email.message}`, { duration: 6000 });
      else toast(`Orden creada correctamente. ${email.message}`, { icon: '⚠️', duration: 10000 });
    } catch (error) {
      toast.error((error as Error).message);
    } finally { setBusy(false); }
  }

  return <>
    <div className="page-heading orders-heading">
      <div><p className="eyebrow">ATENCIÓN EN CAMPO</p><h1>Órdenes de servicio</h1><p className="text-slate-500">Del trabajo realizado a la aceptación del cliente.</p></div>
      <Button disabled={busy || !can(user, 'orders', 'create')} onClick={() => openDraft({
        id: uid(), number: '', clientId: '', techId: user.id, techIds: [user.id],
        serviceName: '', status: 'in_progress', startTime: new Date().toISOString(), diagnosis: '',
        workDone: '', observations: '', signerName: '', consent: false,
      })}><Plus /> Nueva orden</Button>
    </div>
    <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      <label className="min-w-0"><span className="block text-sm font-medium text-slate-700 mb-2">Fecha del servicio</span><Input type="date" value={date} onChange={event => setDate(event.target.value)} className="text-sm" /></label>
      <SearchFilter label="Técnico" placeholder="Elegir o escribir un técnico..." options={technicianOptions} value={technicianFilter} onChange={setTechnicianFilter} />
      <SearchFilter label="Cliente" placeholder="Elegir o escribir un cliente..." options={clientOptions} value={clientFilter} onChange={setClientFilter} />
    </div>
    {loading && <p role="status" className="mb-4 text-sm text-slate-500">Cargando órdenes de las fechas seleccionadas…</p>}
    <div className="orders-toolbar">
      <div className="flex items-center gap-3"><p className="text-sm text-slate-500">{hasFilters ? `${filteredOrders.length} de ${state.orders.length}` : state.orders.length} {state.orders.length === 1 ? 'orden' : 'órdenes'}</p>
        {hasFilters && <Button size="sm" variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>}
      </div>
      <div role="group" aria-label="Vista de órdenes" className="flex gap-1">
        <Button size="sm" variant={view === 'horizontal' ? undefined : 'outline'} aria-pressed={view === 'horizontal'} onClick={() => changeView('horizontal')}><Rows3 size={16} /> Horizontal</Button>
        <Button size="sm" variant={view === 'passport' ? undefined : 'outline'} aria-pressed={view === 'passport'} onClick={() => changeView('passport')}><ContactRound size={16} /> Pasaporte</Button>
      </div>
    </div>
    <div className={`order-grid orders-${view}`}>{filteredOrders.map(order => {
      const technicians = orderTechIds(order).map(id => state.users.find(u => u.id === id)).filter(Boolean);
      const ticket = state.tickets.find(t => t.id === order.ticketId);
      return <section className="panel order-card" key={order.id}>
        <div className="order-card-heading flex justify-between items-center gap-3">
          <p className="ticket-number">{order.number}</p>
          <span className={'status ' + order.status}>{order.status === 'completed' ? 'Completada' : 'En proceso'}</span>
        </div>
        <div className="order-summary">
          <h2>{order.serviceName}</h2>
          <p className="text-sm text-slate-500 mt-1">{state.clients.find(c => c.id === order.clientId)?.businessName}</p>
        </div>
        <dl className="order-details text-sm">
          <div className="flex items-start gap-2"><UserRound size={16} className="mt-0.5 shrink-0 text-slate-500" />
            <div><dt className="text-slate-500">{technicians.length > 1 ? 'Técnicos' : 'Técnico'}</dt><dd className="font-medium">{technicians.map(t => t!.name || t!.email).join(', ') || 'Técnico no disponible'}</dd></div>
          </div>
          <div className="flex items-start gap-2"><CalendarClock size={16} className="mt-0.5 shrink-0 text-slate-500" />
            <div><dt className="text-slate-500">Fecha y hora del servicio</dt><dd>{serviceDate(order.startTime)}</dd></div>
          </div>
          {ticket && <div className="flex items-start gap-2"><Ticket size={16} className="mt-0.5 shrink-0 text-slate-500" />
            <div><dt className="text-slate-500">Ticket relacionado</dt><dd>{ticket.number}</dd></div>
          </div>}
        </dl>
        <Button className="order-open" size="sm" variant="outline" disabled={busy} onClick={async () => {
          setBusy(true);
          try { openDraft(await detail('orders', order.id)); }
          catch (error) { toast.error((error as Error).message); }
          finally { setBusy(false); }
        }}>Ver orden</Button>
      </section>;
    })}</div>
    {!loading && !filteredOrders.length && <section className="panel text-center"><h2>No hay órdenes que coincidan con los filtros</h2><p className="text-sm text-slate-500 mt-2 mb-4">Ajusta la fecha, el técnico o el cliente para consultar otras órdenes.</p><Button size="sm" variant="outline" onClick={clearFilters}>Limpiar filtros</Button></section>}
    <Dialog open={!!draft} onOpenChange={open => { if (!open) openDraft(null); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{draft?.number || 'Nueva orden de servicio'}</DialogTitle><DialogDescription>Al guardar y confirmar, el ticket abierto vinculado se cerrará automáticamente.</DialogDescription></DialogHeader>
        {draft && <form noValidate className="detail-stack" onSubmit={event => {
          event.preventDefault(); if (readOnly || busy) return;
          const errors = orderFieldErrors(draft);
          if (Object.keys(errors).length) {
            setAttempted(true);
            toast.error('Completa los campos marcados en rojo.');
            const form = event.currentTarget;
            // Wait for the invalid state to render, then bring the first field into view.
            requestAnimationFrame(() => { const first = form.querySelector<HTMLElement>('[aria-invalid="true"]'); first?.focus(); first?.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
            return;
          }
          try { void persist(completeOrder(draft)); } catch (error) { toast.error((error as Error).message); }
        }}>
          <fieldset disabled={readOnly} className="detail-stack">
            <div className="form-grid">
              <Field label="Cliente" required error={fieldErrors.clientId}><SearchSelect aria-label="Cliente" placeholder="Buscar cliente…" invalid={!!fieldErrors.clientId} value={draft.clientId} onChange={clientId => set({ clientId, ticketId: undefined, checklistId: undefined })} options={clientOptions} /></Field>
              <Field label="Técnico responsable"><Input readOnly value={state.users.find(u => u.id === draft.techId)?.name || user.name} /></Field>
            </div>
            <TechnicianPicker label="Técnicos que participaron" agents={state.users.filter(u => u.active !== false || orderTechIds(draft).includes(u.id))} value={orderTechIds(draft)} locked={[draft.techId]}
              onChange={ids => set({ techIds: [draft.techId, ...ids.filter(id => id !== draft.techId)] })} disabled={readOnly} />
            <Field label="Fecha y hora del servicio" required error={fieldErrors.startTime}><Input type="datetime-local" aria-invalid={!!fieldErrors.startTime || undefined} value={datetimeLocal(draft.startTime)} onChange={event => set({ startTime: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></Field>
            <Field label="Servicio realizado" required error={fieldErrors.serviceName}><Input aria-invalid={!!fieldErrors.serviceName || undefined} value={draft.serviceName} onChange={event => set({ serviceName: event.target.value })} /></Field>
            <div className="form-grid">
              <Field label="Ticket relacionado (opcional)"><Pick label="Ticket relacionado" value={draft.ticketId || 'none'} onChange={value => set({ ticketId: value === 'none' ? undefined : value })} options={[{ value: 'none', label: 'Sin vínculo' }, ...state.tickets.filter(t => t.clientId === draft.clientId && (t.status !== 'closed' || t.id === draft.ticketId)).map(t => ({ value: t.id, label: t.subject ? `${t.number} · ${t.subject}` : t.number }))]} /></Field>
              <Field label="Checklist relacionado (opcional)"><Pick label="Checklist relacionado" value={draft.checklistId || 'none'} onChange={value => set({ checklistId: value === 'none' ? undefined : value })} options={[{ value: 'none', label: 'Sin vínculo' }, ...state.checklists.filter(c => c.clientId === draft.clientId).map(c => ({ value: c.id, label: c.number }))]} /></Field>
            </div>
            <Field label="Diagnóstico"><Textarea value={draft.diagnosis} onChange={event => set({ diagnosis: event.target.value })} /></Field>
            <Field label="Trabajo realizado" required error={fieldErrors.workDone}><Textarea aria-invalid={!!fieldErrors.workDone || undefined} value={draft.workDone} onChange={event => set({ workDone: event.target.value })} /></Field>
            <Field label="Observaciones y recomendaciones"><Textarea value={draft.observations} onChange={event => set({ observations: event.target.value })} /></Field>
            <Field label="Nombre de quien recibe el servicio" required error={fieldErrors.signerName}><Input aria-invalid={!!fieldErrors.signerName || undefined} value={draft.signerName} onChange={event => set({ signerName: event.target.value })} /></Field>
            <Check label="He revisado el trabajo y las observaciones de esta orden, y confirmo su recepción. *" checked={draft.consent} disabled={readOnly} error={fieldErrors.consent} onChange={consent => set({ consent })} />
          </fieldset>
          <Signature key={draft.id} value={draft.signature} disabled={readOnly} error={fieldErrors.signature} onChange={signature => set({ signature })} />
          {draft.status === 'completed' ? <>
            <p className="subtle">Firmada por {draft.signerName} · {serviceDate(draft.signedAt)}</p>
            <Button type="button" onClick={() => window.print()}><Download /> Imprimir / Guardar PDF</Button>
          </> : !readOnly && <div className="flex gap-3">
            <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y confirmar'}</Button>
            {!attempted && <p className="self-center text-xs text-slate-500"><span className="text-red-600">*</span> Campos obligatorios</p>}
          </div>}
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
