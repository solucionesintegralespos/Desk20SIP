import { z } from 'zod';

export const eventSchema = z.object({
  title: z.string().trim().min(1, 'Escribe el nombre de la tarea').max(160),
  techId: z.string().min(1, 'Selecciona al menos un ingeniero'),
  // Every engineer assigned to the event; techId is the first one (kept for older records).
  techIds: z.array(z.string().min(1)).max(20).optional(),
  clientId: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Fecha inválida'),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  status: z.enum(['planned', 'in_progress', 'completed', 'vacation', 'available', 'permission', 'medical']),
  description: z.string().max(5000),
});

export type ScheduleEvent = z.infer<typeof eventSchema> & { id: string; revision: number };
export type SchedulePerson = { id: string; name: string | null; email: string | null; avatar?: string | null };
// Events saved before multiple engineers only have techId.
export const eventTechIds = (event: { techId: string; techIds?: string[] }) => event.techIds?.length ? event.techIds : [event.techId];
export const statusLabels = { planned: 'Programado', in_progress: 'En proceso', completed: 'Completado', vacation: 'Vacaciones', available: 'Disponible', permission: 'Permiso', medical: 'Cita médica' };

// Events store Bogotá wall-clock dates and times. Colombia has no daylight saving
// time, so the instant is always UTC-5 regardless of the device time zone.
export const scheduledAt = (date: string, start: string) => new Date(`${date}T${start}:00-05:00`);
export const timeLabel = (time: string) => {
  const [hour, minute] = time.split(':');
  return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? 'AM' : 'PM'}`;
};

// Repeating an event: every week on a weekday, or every month on the event's day of the month,
// from the event date until December 31 of that year.
export const repeatSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('weekly'), weekday: z.number().int().min(0).max(6) }),
  z.object({ mode: z.literal('monthly') }),
]);
export type RepeatRule = z.infer<typeof repeatSchema>;
export const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const utcDate = (value: string) => new Date(value + 'T12:00:00Z');
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function repeatDates(start: string, rule: RepeatRule): string[] {
  const year = start.slice(0, 4), end = `${year}-12-31`, dates: string[] = [];
  if (rule.mode === 'weekly') {
    const date = utcDate(start);
    date.setUTCDate(date.getUTCDate() + (rule.weekday - date.getUTCDay() + 7) % 7);
    for (; isoDate(date) <= end; date.setUTCDate(date.getUTCDate() + 7)) dates.push(isoDate(date));
  } else {
    const day = start.slice(8, 10);
    // Months without that day (e.g. the 31st) are skipped rather than moved.
    for (let month = Number(start.slice(5, 7)); month <= 12; month++) {
      const candidate = `${year}-${String(month).padStart(2, '0')}-${day}`;
      if (isoDate(utcDate(candidate)) === candidate) dates.push(candidate);
    }
  }
  return dates;
}

type Occupied = { date: string; start: string; status: string; techId: string; techIds?: string[] };
// Why a repeated occurrence cannot be placed: one of its engineers is on vacation that day,
// or already has another event starting at the same time.
export function repeatConflict(events: Occupied[], date: string, start: string, techIds: string[]): 'vacation' | 'time' | null {
  const sameDay = events.filter(event => event.date === date && eventTechIds(event).some(id => techIds.includes(id)));
  if (sameDay.some(event => event.status === 'vacation')) return 'vacation';
  if (sameDay.some(event => event.start === start)) return 'time';
  return null;
}
