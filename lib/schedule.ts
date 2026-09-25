import { z } from 'zod';

export const eventSchema = z.object({
  title: z.string().trim().min(1, 'Escribe el nombre de la tarea').max(160),
  techId: z.string().min(1),
  clientId: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Fecha inválida'),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  status: z.enum(['planned', 'in_progress', 'completed', 'vacation', 'available']),
  description: z.string().max(5000),
});

export type ScheduleEvent = z.infer<typeof eventSchema> & { id: string; revision: number };
export type SchedulePerson = { id: string; name: string | null; email: string | null; avatar?: string | null };
export const statusLabels = { planned: 'Programado', in_progress: 'En proceso', completed: 'Completado', vacation: 'Vacaciones', available: 'Disponible' };

// Events store Bogotá wall-clock dates and times. Colombia has no daylight saving
// time, so the instant is always UTC-5 regardless of the device time zone.
export const scheduledAt = (date: string, start: string) => new Date(`${date}T${start}:00-05:00`);
export const timeLabel = (time: string) => {
  const [hour, minute] = time.split(':');
  return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? 'AM' : 'PM'}`;
};
