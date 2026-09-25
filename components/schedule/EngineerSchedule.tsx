'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { Button, Input, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui';
import { Field } from '@/components/support/fields';
import { Avatar } from '@/components/ui/Avatar';
import { searchText } from '@/components/support/SearchFilter';
import { colombiaHolidays } from '@/lib/colombia-holidays';
import { serviceDay } from '@/lib/support/order-display';
import { eventSchema, statusLabels, timeLabel, type ScheduleEvent, type SchedulePerson } from '@/lib/schedule';
import { SCHEDULE_CHANGED } from '@/components/reminders/TaskReminders';

type Data = { events: ScheduleEvent[]; engineers: SchedulePerson[]; clients: SchedulePerson[] };
type Draft = Omit<ScheduleEvent, 'id' | 'revision'> & { id?: string; revision?: number };
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
  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/schedule', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'No se pudo cargar la programación');
      setData(result);
    } catch (error) { setError((error as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  // Task reminders link here with ?event=<id>: show its week and open it once loaded.
  const router = useRouter();
  const requestedEvent = useSearchParams().get('event');
  const openedEvent = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedEvent) { openedEvent.current = null; return; }
    if (loading || openedEvent.current === requestedEvent) return;
    const event = data.events.find(item => item.id === requestedEvent);
    if (!event) return;
    openedEvent.current = requestedEvent;
    setEngineer(''); setStatus(''); setQuery('');
    if (new Date(event.date + 'T12:00:00Z').getUTCDay() % 6 === 0) setWeekend(true);
    setWeek(monday(event.date)); setFormError(''); setDeleting(false); setDraft({ ...event });
    router.replace('/dashboard/schedule', { scroll: false });
  }, [loading, requestedEvent, data.events, router]);
  const days = Array.from({ length: weekend ? 7 : 5 }, (_, index) => addDays(week, index));
  const holidays = new Map(Array.from(new Set(days.map(day => Number(day.slice(0, 4))))).flatMap(year => Array.from(colombiaHolidays(year))));
  const clients = new Map(data.clients.map(client => [client.id, client]));
  const engineers = data.engineers.filter(person => !engineer || person.id === engineer);
  const weekEvents = data.events.filter(event => days.includes(event.date) && (!engineer || event.techId === engineer));
  const visibleEvents = weekEvents.filter(event => (!status || event.status === status) && searchText(`${event.title} ${event.description} ${name(clients.get(event.clientId || ''))}`).includes(searchText(query)));
  function open(event?: ScheduleEvent, techId = engineer || data.engineers[0]?.id || '', date = week) {
    setFormError(''); setDeleting(false);
    setDraft(event ? { ...event } : { title: '', techId, clientId: null, date, start: '08:00', status: 'planned', description: '' });
  }
  async function persist(remove = false) {
    if (!draft) return;
    if (!remove) {
      const parsed = eventSchema.safeParse(draft);
      if (!parsed.success) { setFormError(parsed.error.issues[0].message); return; }
    }
    setBusy(true); setFormError('');
    try {
      const response = await fetch('/api/schedule', { method: remove ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'No se pudo guardar');
      setDraft(null); await load();
      window.dispatchEvent(new Event(SCHEDULE_CHANGED));
    } catch (error) { setFormError((error as Error).message); }
    finally { setBusy(false); }
  }
  const patch = (value: Partial<Draft>) => setDraft(current => current && ({ ...current, ...value }));

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
      <div className="schedule-scroll"><table className="schedule-table"><caption className="sr-only">Programación semanal de ingenieros</caption><thead><tr><th scope="col" className="schedule-person">Ingenieros</th>{days.map(day => <th scope="col" key={day} className={[day === serviceDay(new Date().toISOString()) ? 'schedule-today' : '', holidays.has(day) ? 'schedule-holiday' : ''].join(' ')}>{dateLabel(day, { weekday: 'long', day: 'numeric' })}{holidays.has(day) && <span className="schedule-holiday-name">Festivo · {holidays.get(day)}</span>}</th>)}</tr><tr className="schedule-totals"><th className="schedule-person" scope="row">EVENTOS PROGRAMADOS</th>{days.map(day => <td key={day} className={holidays.has(day) ? 'schedule-holiday' : undefined}>{visibleEvents.filter(event => event.date === day).length}</td>)}</tr></thead><tbody>{engineers.map(person => <tr key={person.id}><th scope="row" className="schedule-person"><div className="flex gap-2 items-center"><Avatar src={person.avatar} alt={name(person)} fallback={name(person)} size="lg" className="h-16 w-16 shrink-0 text-2xl" /><span className="min-w-0 line-clamp-3" title={name(person)}>{name(person)}</span></div><p className="text-xs text-slate-500 font-normal mt-2">{visibleEvents.filter(event => event.techId === person.id).length} eventos</p></th>{days.map(day => {
        const events = visibleEvents.filter(event => event.techId === person.id && event.date === day).sort((a, b) => a.start.localeCompare(b.start));
        const allEvents = weekEvents.filter(event => event.techId === person.id && event.date === day);
        return <td key={day} className={holidays.has(day) ? 'schedule-holiday' : undefined}><div className="schedule-cell">{events.map(event => {
          const overlap = allEvents.some(other => other.id !== event.id && other.start === event.start);
          return <button key={event.id} type="button" onClick={() => open(event)} className={`schedule-event schedule-${event.status}`}><span className="font-semibold block">{event.title}</span>{event.clientId && <span className="block mt-1">{name(clients.get(event.clientId))}</span>}<span className="block mt-2 opacity-80">{timeLabel(event.start)}</span><span className="block text-[10px] mt-1">{statusLabels[event.status]}{overlap ? ' · Misma hora de inicio' : ''}</span></button>;
        })}{!events.length && <p className="schedule-empty">{allEvents.length ? 'Sin coincidencias' : 'Sin programación'}</p>}<button type="button" className="schedule-add" aria-label={`Añadir evento para ${name(person)} el ${day}`} onClick={() => open(undefined, person.id, day)}><Plus size={12} />Añadir</button></div></td>;
      })}</tr>)}</tbody></table></div>
      {!engineers.length && <p className="p-8 text-center text-slate-500">No hay ingenieros para mostrar.</p>}
      <p className="text-xs text-slate-500 mt-3">Horario de Colombia. Los eventos con la misma hora de inicio se señalan en la programación.</p>
    </>}
    <Dialog open={!!draft} onOpenChange={value => { if (!value && !busy) setDraft(null); }}><DialogContent><DialogHeader><DialogTitle>{draft?.id ? 'Detalle del evento' : 'Nuevo evento'}</DialogTitle><DialogDescription>Programa una actividad para un ingeniero y un día.</DialogDescription></DialogHeader>{draft && <form onSubmit={event => { event.preventDefault(); void persist(); }} className="detail-stack"><fieldset disabled={busy} className="detail-stack">
      <Field label="Tarea"><Input required maxLength={160} value={draft.title} onChange={event => patch({ title: event.target.value })} /></Field>
      <div className="form-grid"><Field label="Ingeniero"><select required className="border rounded-lg p-2" value={draft.techId} onChange={event => patch({ techId: event.target.value })}>{data.engineers.map(person => <option key={person.id} value={person.id}>{name(person)}</option>)}</select></Field><Field label="Cliente"><select className="border rounded-lg p-2" value={draft.clientId || ''} onChange={event => patch({ clientId: event.target.value || null })}><option value="">Sin cliente / actividad interna</option>{data.clients.map(person => <option key={person.id} value={person.id}>{name(person)}</option>)}</select></Field></div>
      <div className="form-grid"><Field label="Fecha"><Input required type="date" value={draft.date} onChange={event => patch({ date: event.target.value })} /></Field><Field label="Estado"><select className="border rounded-lg p-2" value={draft.status} onChange={event => patch({ status: event.target.value as Draft['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
      <Field label="Hora inicial"><Input required type="time" value={draft.start} onChange={event => patch({ start: event.target.value })} /></Field>
      <Field label="Descripción"><Textarea rows={3} maxLength={5000} value={draft.description} onChange={event => patch({ description: event.target.value })} /></Field>
      {formError && <p role="alert" className="text-red-700 text-sm">{formError}</p>}
      {deleting ? <div className="bg-red-50 p-3 rounded-lg"><p className="text-sm mb-2">¿Eliminar este evento de la programación?</p><div className="flex gap-2"><Button variant="outline" onClick={() => setDeleting(false)}>Cancelar</Button><Button onClick={() => void persist(true)}>Confirmar eliminación</Button></div></div> : <div className="flex justify-between gap-2 flex-wrap"><Button type="submit">{busy ? 'Guardando…' : 'Guardar cambios'}</Button>{draft.id && <Button variant="ghost" className="text-red-700" onClick={() => setDeleting(true)}>Eliminar evento</Button>}</div>}
    </fieldset></form>}</DialogContent></Dialog>
  </div>;
}
