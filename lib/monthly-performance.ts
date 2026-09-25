import { serviceDay } from './support/order-display'

export function monthlyRange(now = new Date()) {
  const [year, month] = serviceDay(now.toISOString()).split('-').map(Number)
  const gte = new Date(Date.UTC(year, month - 1, 1, 5))
  const lt = new Date(Date.UTC(year, month, 1, 5))
  const label = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(gte)
  return { gte, lt, label }
}
