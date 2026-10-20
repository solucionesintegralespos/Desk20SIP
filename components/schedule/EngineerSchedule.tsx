'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, Input, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui';
import { Field } from '@/components/support/fields';
import { Avatar } from '@/components/ui/Avatar';
import { searchText } from '@/components/support/SearchFilter';
import { colombiaHolidays } from '@/lib/colombia-holidays';
import { serviceDay } from '@/lib/support/order-display';
import { eventSchema, eventTechIds, statusLabels, timeLabel, repeatDates, repeatConflict, weekdayLabels, type RepeatRule, type ScheduleEvent, type SchedulePerson } from '@/lib/schedule';
import TechnicianPicker from '@/components/tickets/TechnicianPicker';
import { SCHEDULE_CHANGED } from '@/components/reminders/TaskReminders';
import { SearchSelect } from '@/components/ui/SearchSelect';

type Data = { events: ScheduleEvent[]; engineers: SchedulePerson[]; clients: SchedulePerson[] };
type Draft = Omit<ScheduleEvent, 'id' | 'revision'> & { id?: string; revision?: number };
type Repeat = { mode: 'none' | 'weekly' | 'monthly'; weekday: number };
const weekdayOf = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();
const toRule = (repeat: Repeat): RepeatRule | null => repeat.mode === 'weekly' ? { mode: 'weekly', weekday: repeat.weekday } : repeat.mode === 'monthly' ? { mode: 'monthly' } : null;
const shortDate = (date: string) => new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
const name = (person?: SchedulePerson) => person?.name || person?.email || 'Sin nombre';

function addDays(value: string, days: number) {
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function monday(value: string) {
  const day = new Date(value + 'T12:00:00Z').getUTCDay();
  return addDays(value, -(day === 0 ? 6 : day - 1));
}
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-CO', { ...options, timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));

export default function EngineerSchedule() {
  const [data, setData] = useState<Data>({ events: [], engineers: [], clients: [] });
  const [week, setWeek] = useState(() => monday(serviceDay(new Date().toISOString())));
  const [weekend, setWeekend] = useState(false);
  const [engineer, setEngineer] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'details' | 'repeat'>('details');
  const [repeat, setRepeat] = useState<Repeat>({ mode: 'none', weekday: 1 });
  const [completing, setCompleting] = useState<string | null>(null);
  // Task reminders link here with ?event=<id>: that event is fetched with the week, then shown.
  const router = useRouter();
  const requestedEvent = useSearchParams().get('event');
  const openedEvent = useRef<string | null>(null);
  const loadId = useRef(0);
  // Only the visible week is fetched (Monday to Sunday, so the weekend toggle needs no reload).
  async function load(target = week) {
    const id = ++loadId.current;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ from: target, to: addDays(target, 6) });
      if (requestedEvent && openedEvent.current !== requestedEvent) params.set('include', requestedEvent);
      const response = await fetch(`/api/schedule?${params}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'No se pudo cargar la programación');
      if (id === loadId.current) setData(result);
    } catch (error) { if (id === loadId.current) setError((error as Error).message); }
    finally { if (id === loadId.current) setLoading(false); }
  }
  useEffect(() => { void load(week); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!requestedEvent) { openedEvent.current = null; return; }
    if (loading || openedEvent.current === requestedEvent) return;
    const event = data.events.find(item => item.id === requestedEvent);
    if (!event) return;
    openedEvent.current = requestedEvent;
    setEngineer(''); setStatus(''); setQuery('');
    if (new Date(event.date + 'T12:00:00Z').getUTCDay() % 6 === 0) setWeekend(true);
    setWeek(monday(event.date)); setFormError(''); setDeleting(false); setDraft({ ...event, techIds: eventTechIds(event) });
    router.replace('/dashboard/schedule', { scroll: false });
  }, [loading, requestedEvent, data.events, router]);
  const days = Array.from({ length: weekend ? 7 : 5 }, (_, index) => addDays(week, index));
  const holidays = new Map(Array.from(new Set(days.map(day => Number(day.slice(0, 4))))).flatMap(year => Array.from(colombiaHolidays(year))));
  const clients = new Map(data.clients.map(client => [client.id, client]));
  const engineers = data.engineers.filter(person => !engineer || person.id === engineer);
  // The API lists active engineers only; events of inactive engineers stay stored and return when they are reactivated.
  const activeIds = new Set(data.engineers.map(person => person.id));
  const weekEvents = data.events.filter(event => days.includes(event.date) && eventTechIds(event).some(id => activeIds.has(id)) && (!engineer || eventTechIds(event).includes(engineer)));
  const visibleEvents = weekEvents.filter(event => (!status || event.status === status) && searchText(`${event.title} ${event.description} ${name(clients.get(event.clientId || ''))}`).includes(searchText(query)));
  function open(event?: ScheduleEvent, techId = engineer || data.engineers[0]?.id || '', date = week) {
    setFormError(''); setDeleting(false); setTab('details');
    setRepeat({ mode: 'none', weekday: weekdayOf(event?.date || date) });
    setDraft(event ? { ...event, techIds: eventTechIds(event) } : { title: '', techId, techIds: techId ? [techId] : [], clientId: null, date, start: '08:00', status: 'planned', description: '' });
  }
  async function persist(remove = false): Promise<boolean> {
    if (!draft) return false;
    if (!remove) {
      const parsed = eventSchema.safeParse(draft);
      if (!parsed.success) { setFormError(parsed.error.issues[0].message); return false; }
    }
    setBusy(true); setFormError('');
    const rule = !remove && !draft.id ? toRule(repeat) : null;
    try {
      const response = await fetch('/api/schedule', { method: remove ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rule ? { ...draft, repeat: rule } : draft) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'No se pudo guardar');
      if (rule) {
        const skipped = result.skipped as { date: string }[];
        toast.success(`Se crearon ${result.created.length} eventos${skipped.length ? `; se omitieron ${skipped.length} fechas con otro evento a la misma hora o vacaciones` : ''}.`, { duration: 8000 });
      }
      setDraft(null); await load();
      window.dispatchEvent(new Event(SCHEDULE_CHANGED));
      return true;
    } catch (error) { setFormError((error as Error).message); return false; }
    finally { setBusy(false); }
  }
  // Saves the event, then opens the ticket form prefilled with its data; category, type
  // and priority are completed there and the usual ticket validation applies.
  async function saveAsTicket() {
    if (!draft?.clientId) return;
    const event = draft;
    if (!await persist()) return;
    const when = `${shortDate(event.date)}, ${timeLabel(event.start)}`;
    const params = new URLSearchParams({
      subject: event.title, customerId: event.clientId!, assignees: (event.techIds || [event.techId]).join(','), source: `el evento «${event.title}»`,
      description: [event.description.slice(0, 1500), `Evento programado: ${when} (hora de Colombia).`].filter(Boolean).join('\n\n'),
    });
    router.push(`/dashboard/tickets/new?${params}`);
  }
  const patch = (value: Partial<Draft>) => setDraft(current => current && ({ ...current, ...value }));
  // Dragging a card to another cell changes its day and, across rows, swaps that engineer.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  async function moveEvent(id: string, fromTech: string, toTech: string, date: string) {
    const event = data.events.find(item => item.id === id);
    if (!event || (fromTech === toTech && event.date === date)) return;
    const current = eventTechIds(event);
    const techIds = current.includes(toTech) ? current.filter(tech => tech !== fromTech || tech === toTech) : current.map(tech => tech === fromTech ? toTech : tech);
    try {
      const response = await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...event, date, techIds, techId: techIds[0] }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'No se pudo mover el evento');
      toast.success(`«${event.title}» movido al ${shortDate(date)}${fromTech !== toTech ? ` · ${name(data.engineers.find(person => person.id === toTech))}` : ''}`);
      await load();
      window.dispatchEvent(new Event(SCHEDULE_CHANGED));
    } catch (error) { toast.error((error as Error).message); }
  }
  // "Listo" on the weekly grid: mark the task completed without opening it.
  async function complete(event: ScheduleEvent) {
    setCompleting(event.id);
    try {
      const response = await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...event, techIds: eventTechIds(event), status: 'completed' }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'No se pudo completar la tarea');
      toast.success(`«${event.title}» marcada como completada`);
      await load();
      window.dispatchEvent(new Event(SCHEDULE_CHANGED));
    } catch (error) { toast.error((error as Error).message); }
    finally { setCompleting(null); }
  }
  // Preview of a repeated event, computed with the same rules the server applies.
  const rule = draft && !draft.id ? toRule(repeat) : null;
  const [yearEvents, setYearEvents] = useState<ScheduleEvent[] | null>(null);
  const previewFrom = rule && draft ? draft.date : '';
  useEffect(() => {
    if (!previewFrom) { setYearEvents(null); return; }
    let cancelled = false;
    fetch(`/api/schedule?${new URLSearchParams({ from: previewFrom, to: `${previewFrom.slice(0, 4)}-12-31` })}`, { cache: 'no-store' })
      .then(response => response.json()).then(result => { if (!cancelled) setYearEvents(result.events || []); })
      .catch(() => { if (!cancelled) setYearEvents([]); });
    return () => { cancelled = true; };
  }, [previewFrom]);
  const preview = draft && rule ? repeatDates(draft.date, rule).map(date => ({ date, reason: repeatConflict(yearEvents || [], date, draft.start, draft.techIds || []) })) : [];
  const skippedPreview = preview.filter(item => item.reason);

  return <div className="h-full overflow-auto p-4 lg:p-6 service-module">
    <div className="page-heading items-center"><div><p className="eyebrow">EQUIPO TÉCNICO</p><h1 className="flex items-center gap-3"><CalendarDays className="text-primary-600" />Programación de ingenieros</h1><p className="text-sm text-slate-500 mt-1">Organiza las visitas, tareas y ausencias del equipo.</p></div><Button disabled={loading || !!error || !data.engineers.length} onClick={() => open()}><Plus size={16} />Nuevo evento</Button></div>
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <div className="flex items-center gap-2 flex-wrap"><Button variant="outline" aria-label="Semana anterior" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={16} /></Button><Button variant="outline" aria-label="Semana siguiente" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={16} /></Button><p className="font-semibold text-sm mx-2">{dateLabel(week, { day: 'numeric', month: 'short' })} – {dateLabel(days[days.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}</p><Button variant="outline" size="sm" onClick={() => setWeek(monday(serviceDay(new Date().toISOString())))}>Hoy</Button></div>
      <div className="flex gap-3 items-center"><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={weekend} onChange={event => setWeekend(event.target.checked)} />Fin de semana</label><Button variant="ghost" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />Actualizar</Button></div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white border rounded-xl p-3 mb-3">
      <label className="text-sm">Ingeniero<select className="block border rounded-lg w-full p-2 mt-1" value={engineer} onChange={event => setEngineer(event.target.value)}><option value="">Todos los ingenieros</option>{data.engineers.map(person => <option key={person.id} value={person.id}>{name(person)}</option>)}</select></label>
      <label className="text-sm">Estado<select className="block border rounded-lg w-full p-2 mt-1" value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Cliente o tarea<Input className="mt-1" placeholder="Buscar cliente o tarea…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="flex justify-between items-center flex-wrap gap-2 mb-3 text-xs text-slate-500"><div className="flex gap-3 flex-wrap">{Object.entries(statusLabels).map(([value, label]) => <span key={value} className="flex items-center gap-1"><span className={`schedule-dot schedule-${value}`} />{label}</span>)}<span className="flex items-center gap-1"><span className="schedule-dot schedule-holiday-key" />Festivo de Colombia</span></div><span>{visibleEvents.length} eventos · Eventos de la semana seleccionada</span>{(query || status || engineer) && <Button size="sm" variant="ghost" onClick={() => { setEngineer(''); setStatus(''); setQuery(''); }}>Limpiar filtros</Button>}</div>
    {error ? <div role="alert" className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-lg">{error}<Button variant="outline" className="ml-3" onClick={() => void load()}>Reintentar</Button></div> : loading ? <p role="status" className="p-8 text-center">Cargando programación…</p> : <>
      <div className="schedule-scroll"><table className="schedule-table"><caption className="sr-only">Programación semanal de ingenieros</caption><thead><tr><th scope="col" className="schedule-person">Ingenieros</th>{days.map(day => <th scope="col" key={day} className={[day === serviceDay(new Date().toISOString()) ? 'schedule-today' : '', holidays.has(day) ? 'schedule-holiday' : ''].join(' ')}>{dateLabel(day, { weekday: 'long', day: 'numeric' })}{holidays.has(day) && <span className="schedule-holiday-name">Festivo · {holidays.get(day)}</span>}</th>)}</tr><tr className="schedule-totals"><th className="schedule-person" scope="row">EVENTOS PROGRAMADOS</th>{days.map(day => <td key={day} className={holidays.has(day) ? 'schedule-holiday' : undefined}>{visibleEvents.filter(event => event.date === day).length}</td>)}</tr></thead><tbody>{engineers.map(person => <tr key={person.id}><th scope="row" className="schedule-person"><div className="flex gap-2 items-center"><Avatar src={person.avatar} alt={name(person)} fallback={name(person)} size="lg" className="h-16 w-16 shrink-0 text-2xl" /><span className="min-w-0 line-clamp-3" title={name(person)}>{name(person)}</span></div><p className="text-xs text-slate-500 font-normal mt-2">{visibleEvents.filter(event => eventTechIds(event).includes(person.id)).length} eventos</p></th>{days.map(day => {
        const events = visibleEvents.filter(event => eventTechIds(event).includes(person.id) && event.date === day).sort((a, b) => a.start.localeCompare(b.start));
        const allEvents = weekEvents.filter(event => eventTechIds(event).includes(person.id) && event.date === day);
        const cellKey = `${person.id}|${day}`;
        return <td key={day} className={[holidays.has(day) ? 'schedule-holiday' : '', dropTarget === cellKey ? 'schedule-drop' : ''].join(' ') || undefined}
          onDragOver={event => { if (dragging) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
          onDragEnter={() => { if (dragging) setDropTarget(cellKey); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(current => current === cellKey ? null : current); }}
          onDrop={event => { event.preventDefault(); setDropTarget(null); setDragging(null); try { const { id, from } = JSON.parse(event.dataTransfer.getData('text/plain')); void moveEvent(id, from, person.id, day); } catch { /* Not one of our cards. */ } }}><div className="schedule-cell">{events.map(event => {
          const overlap = allEvents.some(other => other.id !== event.id && other.start === event.start);
          const pending = event.status === 'planned' || event.status === 'in_progress';
          return <div key={event.id} className={`schedule-event schedule-${event.status} ${dragging === event.id ? 'schedule-dragging' : ''}`} draggable
            onDragStart={drag => { drag.dataTransfer.setData('text/plain', JSON.stringify({ id: event.id, from: person.id })); drag.dataTransfer.effectAllowed = 'move'; setDragging(event.id); }}
            onDragEnd={() => { setDragging(null); setDropTarget(null); }}><button type="button" onClick={() => open(event)} className="schedule-event-open"><span className="font-semibold block">{event.title}</span>{event.clientId && <span className="block mt-1">{name(clients.get(event.clientId))}</span>}<span className="block mt-2 opacity-80">{timeLabel(event.start)}</span>{eventTechIds(event).length > 1 && <span className="block text-[10px] mt-1" title={eventTechIds(event).map(id => name(data.engineers.find(person => person.id === id))).join(', ')}>Compartido · {eventTechIds(event).length} ingenieros</span>}<span className="block text-[10px] mt-1">{statusLabels[event.status]}{overlap ? ' · Misma hora de inicio' : ''}</span></button>{pending && <button type="button" className="schedule-done" disabled={completing === event.id} onClick={() => void complete(event)} aria-label={`Marcar «${event.title}» como completada`}><Check size={11} aria-hidden="true" />{completing === event.id ? 'Guardando…' : 'Listo'}</button>}</div>;
        })}{!events.length && <p className="schedule-empty">{allEvents.length ? 'Sin coincidencias' : 'Sin programación'}</p>}<button type="button" className="schedule-add" aria-label={`Añadir evento para ${name(person)} el ${day}`} onClick={() => open(undefined, person.id, day)}><Plus size={12} />Añadir</button></div></td>;
      })}</tr>)}</tbody></table></div>
      {!engineers.length && <p className="p-8 text-center text-slate-500">No hay ingenieros para mostrar.</p>}
      <p className="text-xs text-slate-500 mt-3">Horario de Colombia. Los eventos con la misma hora de inicio se señalan en la programación. Arrastra un evento a otro día o ingeniero para moverlo (con mouse).</p>
    </>}
    <Dialog open={!!draft} onOpenChange={value => { if (!value && !busy) setDraft(null); }}><DialogContent><DialogHeader><DialogTitle>{draft?.id ? 'Detalle del evento' : 'Nuevo evento'}</DialogTitle><DialogDescription>Programa una actividad para un ingeniero y un día.</DialogDescription></DialogHeader>{draft && <form noValidate onSubmit={event => { event.preventDefault(); void persist(); }} className="detail-stack"><fieldset disabled={busy} className="detail-stack">
      {!draft.id && <div role="tablist" aria-label="Secciones del evento" className="schedule-tabs">
        {([['details', 'Detalles'], ['repeat', rule ? 'Repetir · activo' : 'Repetir']] as const).map(([value, label]) => <button key={value} type="button" role="tab" id={`schedule-tab-${value}`} aria-selected={tab === value} aria-controls={`schedule-panel-${value}`} onClick={() => setTab(value)}>{label}</button>)}
      </div>}
      <div role={draft.id ? undefined : 'tabpanel'} id="schedule-panel-details" aria-labelledby={draft.id ? undefined : 'schedule-tab-details'} hidden={tab !== 'details'} className="detail-stack">
      <Field label="Tarea"><Input required maxLength={160} value={draft.title} onChange={event => patch({ title: event.target.value })} /></Field>
      <TechnicianPicker label="Ingenieros asignados" agents={data.engineers} value={draft.techIds || []} onChange={techIds => patch({ techIds, techId: techIds[0] || '' })} />
      <div><Field label="Cliente"><SearchSelect aria-label="Cliente" placeholder="Buscar cliente…" emptyOption="Sin cliente / actividad interna" value={draft.clientId || ''} onChange={clientId => patch({ clientId: clientId || null })} options={data.clients.map(person => ({ id: person.id, label: name(person), description: person.name ? person.email || undefined : undefined }))} /></Field></div>
      <div className="form-grid"><Field label="Fecha"><Input required type="date" value={draft.date} onChange={event => patch({ date: event.target.value })} /></Field><Field label="Estado"><select className="border rounded-lg p-2" value={draft.status} onChange={event => patch({ status: event.target.value as Draft['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
      <Field label="Hora inicial"><Input required type="time" value={draft.start} onChange={event => patch({ start: event.target.value })} /></Field>
      <Field label="Descripción"><Textarea rows={3} maxLength={5000} value={draft.description} onChange={event => patch({ description: event.target.value })} /></Field>
      </div>
      {!draft.id && <div role="tabpanel" id="schedule-panel-repeat" aria-labelledby="schedule-tab-repeat" hidden={tab !== 'repeat'} className="detail-stack">
        <fieldset className="space-y-3 text-sm"><legend className="font-medium mb-2">Repetir este evento</legend>
          <label className="flex items-center gap-2"><input type="radio" name="repeat" checked={repeat.mode === 'none'} onChange={() => setRepeat({ ...repeat, mode: 'none' })} />No repetir</label>
          <label className="flex flex-wrap items-center gap-2"><input type="radio" name="repeat" checked={repeat.mode === 'weekly'} onChange={() => setRepeat({ ...repeat, mode: 'weekly' })} />Cada semana, el
            <select aria-label="Día de la semana" className="border rounded-lg p-1.5" value={repeat.weekday} onChange={event => setRepeat({ mode: 'weekly', weekday: Number(event.target.value) })}>{weekdayLabels.map((label, index) => <option key={label} value={index}>{label.toLowerCase()}</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="radio" name="repeat" checked={repeat.mode === 'monthly'} onChange={() => setRepeat({ ...repeat, mode: 'monthly' })} />Cada mes, el día {Number(draft.date.slice(8, 10)) || '—'}</label>
        </fieldset>
        {rule && <div className="rounded-lg border border-primary-100 bg-primary-50 p-3 text-sm">
          <p>Desde el {shortDate(draft.date)} hasta el 31 de diciembre de {draft.date.slice(0, 4)}, a las {timeLabel(draft.start)}: <strong>{preview.length - skippedPreview.length} eventos</strong>.</p>
          <p className="mt-1 text-xs text-slate-500">Se omiten los días en que alguno de los ingenieros ya tiene un evento a la misma hora o está de vacaciones{rule.mode === 'monthly' ? ', y los meses que no tienen ese día' : ''}.</p>
          {skippedPreview.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer">{skippedPreview.length} fechas omitidas</summary><ul className="mt-1 max-h-32 overflow-y-auto">{skippedPreview.map(item => <li key={item.date}>{shortDate(item.date)} · {item.reason === 'vacation' ? 'vacaciones' : 'otro evento a la misma hora'}</li>)}</ul></details>}
          {!preview.length && <p className="mt-1 text-xs">No hay fechas para repetir antes de fin de año.</p>}
          {yearEvents === null && preview.length > 0 && <p className="mt-1 text-xs text-slate-500">Comprobando fechas ocupadas…</p>}
        </div>}
      </div>}
      {formError && <p role="alert" className="text-red-700 text-sm">{formError}</p>}
      {deleting ? <div className="bg-red-50 p-3 rounded-lg"><p className="text-sm mb-2">¿Eliminar este evento de la programación?</p><div className="flex gap-2"><Button variant="outline" onClick={() => setDeleting(false)}>Cancelar</Button><Button onClick={() => void persist(true)}>Confirmar eliminación</Button></div></div> : <div className="flex justify-between gap-2 flex-wrap"><div className="flex flex-wrap gap-2"><Button type="submit">{busy ? 'Guardando…' : rule ? `Crear ${preview.length - skippedPreview.length} eventos` : 'Guardar cambios'}</Button>
        {!rule && <Button variant="outline" disabled={!draft.clientId} onClick={() => void saveAsTicket()} title={draft.clientId ? 'Guarda el evento y abre un ticket con sus datos' : 'Selecciona un cliente para crear el ticket'}>Guardar y crear ticket</Button>}</div>{draft.id && <Button variant="ghost" className="text-red-700" onClick={() => setDeleting(true)}>Eliminar evento</Button>}</div>}
    </fieldset></form>}</DialogContent></Dialog>
  </div>;
}
