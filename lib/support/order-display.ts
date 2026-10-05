// Orders saved before multiple technicians only have techId.
export const orderTechIds = (order: { techId: string; techIds?: string[] }) => order.techIds?.length ? order.techIds : [order.techId];

export function serviceDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Sin fecha registrada';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota',
  }).format(new Date(value));
}

export function datetimeLocal(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function serviceDay(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
