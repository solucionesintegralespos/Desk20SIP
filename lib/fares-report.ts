import { prisma } from '@/lib/prisma'
import { ServiceError } from '@/lib/accounting/server'
import { listFares } from '@/lib/fares'
import { currentPeriod } from '@/lib/accounting/format'

// Shared by the fares list and its Excel export (route files cannot export helpers).
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** First and last day of the current month in Bogotá. */
export function defaultFareRange() {
  const period = currentPeriod()
  const [year, month] = period.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` }
}

export function parseFareRange(params: URLSearchParams) {
  const defaults = defaultFareRange()
  const from = DATE.test(params.get('from') || '') ? params.get('from')! : defaults.from
  const to = DATE.test(params.get('to') || '') ? params.get('to')! : defaults.to
  if (to < from) throw new ServiceError('Rango de fechas inválido')
  const tech = (params.get('tech') || '').trim().slice(0, 100) || undefined
  return { from, to, tech }
}

export type FareRow = Awaited<ReturnType<typeof fareRows>>[number]
/**
 * One row per engineer and event: a shared event with three engineers yields three fares of the
 * same value, each with its own status, so one of them can be accepted or removed on its own.
 */
export async function fareRows(from: string, to: string, tech?: string) {
  const fares = await listFares(from, to, tech)
  const ids = Array.from(new Set(fares.flatMap(fare => [...fare.techIds, fare.clientId || '']).filter(Boolean)))
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : []
  const nameOf = (id: string) => { const person = people.find(p => p.id === id); return person ? person.name || person.email || 'Sin nombre' : 'Usuario' }
  return fares.flatMap(fare => fare.techIds.filter(id => fare.fares[id]).map(techId => ({
    id: fare.id, techId, key: `${fare.id}:${techId}`, date: fare.date, start: fare.start, title: fare.title, reason: fare.fareReason || '', amountCents: fare.fareCents || 0,
    status: fare.fares[techId].status, paidAt: fare.fares[techId].paidAt || null, revision: fare.revision,
    technician: { id: techId, name: nameOf(techId) },
    // Every engineer assigned to the event, so a shared event is recognisable on each of its rows.
    technicians: fare.techIds.map(id => ({ id, name: nameOf(id) })),
    customer: fare.clientId ? { id: fare.clientId, name: nameOf(fare.clientId) } : null,
  })))
}
