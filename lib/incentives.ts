import { z } from 'zod'
import { incentiveMonth, incentiveResult } from './incentive-calculation'

const count = z.number().int().min(0).max(100000000).nullable()
export const indicatorSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().trim().min(1).max(250), group: z.string().max(50),
  source: z.enum(['manual', 'created', 'urgent', 'projects', 'weekend', 'first_contact', 'same_day_urgent', 'backlog']),
  direction: z.enum(['at_least', 'at_most']), target: z.number().min(0).max(100000), amount: z.number().int().min(0).max(100000000),
  numerator: count, denominator: count, days: z.number().int().min(1).max(365),
  categoryIds: z.array(z.string()).max(100), tag: z.string().trim().max(100),
  priorities: z.array(z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])).max(4),
  confirmed: z.boolean(), note: z.string().max(2000),
  strictDays: z.boolean().default(false),
})
export const planSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), leaderId: z.string().max(100),
  leaderRole: z.enum(['helpdesk', 'cizaro', 'fe']),
  teamIds: z.array(z.string()).min(1).max(100), indicators: z.array(indicatorSchema).max(100),
}).superRefine((plan, ctx) => {
  if (new Set(plan.indicators.map(i => i.id)).size !== plan.indicators.length) ctx.addIssue({ code: 'custom', message: 'Indicadores duplicados' })
  if (plan.indicators.some(i => ['urgent', 'same_day_urgent'].includes(i.source) && !i.priorities.length)) ctx.addIssue({ code: 'custom', message: 'Selecciona las prioridades del indicador' })
})
export type Indicator = z.infer<typeof indicatorSchema>
export type IncentivePlan = z.infer<typeof planSchema>
export interface IncentiveTicket {
  id: string; number: number; createdAt: Date; closedAt: Date | null; status: string; type: string | null;
  priority: string; categoryId: string | null; tags: string[]; assigneeId: string | null; assignments: { userId: string }[];
  messages?: { content: string; createdAt: Date }[];
}
export const leaderRoles = { helpdesk: 'Líder de Mesa de Ayuda', cizaro: 'Líder de Cizaro', fe: 'Líder de FE' }
const localDay = (date: Date) => new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 10)
export function ticketAt(ticket: IncentiveTicket, cutoff: Date) {
  const events = (ticket.messages || []).flatMap(message => {
    const match = /^Estado cambiado de (OPEN|PENDING|CLOSED|SOLVED) a (OPEN|PENDING|CLOSED|SOLVED)$/.exec(message.content)
    if (match) return [{ at: message.createdAt, before: match[1], after: match[2] }]
    if (message.content.startsWith('Ticket cerrado automáticamente al confirmar la orden de servicio:')) return [{ at: message.createdAt, before: 'OPEN', after: 'CLOSED' }]
    return []
  }).sort((a, b) => a.at.getTime() - b.at.getTime())
  if (!events.length) return { ...ticket, status: ticket.closedAt && ticket.closedAt >= cutoff ? 'OPEN' : ticket.status }
  let status = events[0].before
  let closedAt: Date | null = ticket.closedAt && ticket.closedAt < cutoff ? ticket.closedAt : null
  for (const event of events) {
    if (event.at >= cutoff) break
    status = event.after
    closedAt = status === 'CLOSED' ? event.at : null
  }
  return { ...ticket, status, closedAt }
}
export function calculatePlan(plan: IncentivePlan, tickets: IncentiveTicket[], now = new Date()) {
  const { start, end } = incentiveMonth(plan.month)
  const cutoff = new Date(Math.min(end.getTime(), now.getTime()))
  const teamTickets = tickets.filter(t => t.createdAt < cutoff &&
    (t.assignments.some(a => plan.teamIds.includes(a.userId)) || (!!t.assigneeId && plan.teamIds.includes(t.assigneeId))))
    .map(t => ticketAt(t, cutoff))
  const cohort = teamTickets.filter(t => t.createdAt >= start)
  const rows = plan.indicators.map(indicator => {
    let selected = (indicator.source === 'backlog' ? teamTickets : cohort).filter(t => (!indicator.categoryIds.length || (!!t.categoryId && indicator.categoryIds.includes(t.categoryId))) &&
      (!indicator.tag || t.tags.some(tag => tag.toLocaleLowerCase('es') === indicator.tag.toLocaleLowerCase('es'))))
    let numerator = indicator.numerator, denominator = indicator.denominator
    let matching: IncentiveTicket[] = []
    if (indicator.source !== 'manual') {
      if (['urgent', 'same_day_urgent'].includes(indicator.source)) selected = selected.filter(t => indicator.priorities.includes(t.priority as Indicator['priorities'][number]))
      if (indicator.source === 'projects') selected = selected.filter(t => t.type === 'PROJECT')
      matching = selected
      if (indicator.source === 'weekend') matching = selected.filter(t => [0, 6].includes(new Date(t.createdAt.getTime() - 5 * 3600000).getUTCDay()))
      if (indicator.source === 'backlog') matching = selected.filter(t => ['OPEN', 'PENDING'].includes(t.status) && cutoff.getTime() - t.createdAt.getTime() > 30 * 86400000)
      if (['first_contact', 'same_day_urgent'].includes(indicator.source)) {
        denominator = selected.length
        matching = selected.filter(t => t.status === 'CLOSED' && t.closedAt && t.closedAt >= t.createdAt && t.closedAt < cutoff && localDay(t.createdAt) === localDay(t.closedAt))
      }
      if (indicator.source === 'urgent' || indicator.source === 'projects') {
        denominator = selected.length
        matching = selected.filter(t => t.status === 'CLOSED' && t.closedAt && t.closedAt >= t.createdAt && t.closedAt < cutoff &&
          (indicator.strictDays ? t.closedAt.getTime() - t.createdAt.getTime() < indicator.days * 86400000 : t.closedAt.getTime() - t.createdAt.getTime() <= indicator.days * 86400000))
      }
      numerator = matching.length
    }
    const result = incentiveResult({ ...indicator, numerator, denominator })
    return { id: indicator.id, numerator, denominator, percentage: result.percentage,
      status: indicator.confirmed ? result.status : 'pending' as const, payout: indicator.confirmed ? result.payout : 0,
      ticketNumbers: matching.map(t => t.number), denominatorTicketNumbers: ['urgent', 'projects', 'first_contact', 'same_day_urgent'].includes(indicator.source) ? selected.map(t => t.number) : [],
    }
  })
  return { rows, total: rows.reduce((sum, r) => sum + r.payout, 0), calculatedAt: now.toISOString() }
}
export type IncentiveResults = ReturnType<typeof calculatePlan>
export interface SavedIncentivePlan extends IncentivePlan {
  leaderName: string; closedAt?: string; closedBy?: string; snapshot?: IncentiveResults;
}
export function exampleIndicators(): Indicator[] {
  const rows: [string, string, number, number, boolean][] = [
    ['FE', 'Casos resueltos en primer contacto / casos recibidos', 80, 25000, false],
    ['FE', 'Urgentes resueltos en tres días / casos de prioridad media y alta', 75, 25000, false],
    ['FE', 'Tickets generados / meta de tickets', 95, 25000, false],
    ['FE', 'Proyectos resueltos en menos de siete días / proyectos del mes', 75, 25000, false],
    ['FE', 'Tickets abiertos con más de 30 días / backlog permitido', 50, 25000, true],
    ['FE', 'Revisiones Ultrafec / puntos instalados', 80, 25000, false],
    ['FE', 'Revisiones Cizaro / puntos instalados', 85, 25000, false],
    ['FE', 'Soportes Soflogy / puntos instalados', 7, 25000, true],
    ['POS', 'Casos resueltos en primer contacto / casos recibidos', 80, 33333, false],
    ['POS', 'Urgentes resueltos el mismo día / urgentes de prioridad alta', 75, 33333, false],
    ['POS', 'Tickets generados / meta de tickets', 90, 33333, false],
    ['POS', 'Proyectos resueltos en menos de cinco días / proyectos', 75, 33333, false],
    ['POS', 'Tickets abiertos con más de 30 días / backlog permitido', 70, 33333, true],
    ['POS', 'Tickets del fin de semana / meta del fin de semana', 80, 33333, false],
  ]
  return rows.map(([group, name, target, amount, maximum], index) => ({ id: `example-${index}`, group, name, target, amount,
    source: 'manual', direction: maximum ? 'at_most' : 'at_least', numerator: null, denominator: null, days: 3,
    categoryIds: [], tag: '', priorities: ['HIGH', 'URGENT'], confirmed: false, note: '', strictDays: false,
  }))
}

export function initialPlan(month: string, role: IncentivePlan['leaderRole'], staffIds: string[], categories: { id: string; name: string }[]): SavedIncentivePlan {
  const fe = categories.filter(c => /(^FE\s|\sFE$)/i.test(c.name)).map(c => c.id)
  const pos = categories.filter(c => /^ALDELO (POS|EXPRESS|WEB)$/i.test(c.name)).map(c => c.id)
  const indicators = role !== 'helpdesk' ? [] : exampleIndicators().map((indicator, index): Indicator => {
    const sources: Indicator['source'][] = ['first_contact', 'urgent', 'created', 'projects', 'backlog', 'created', 'created', 'created', 'first_contact', 'same_day_urgent', 'created', 'projects', 'backlog', 'weekend']
    let categoryIds = indicator.group === 'FE' ? fe : pos
    if (index === 5) categoryIds = categories.filter(c => c.name.toUpperCase() === 'REVICIONES ALDELO FE').map(c => c.id)
    if (index === 6) categoryIds = categories.filter(c => c.name.toUpperCase() === 'REVISIONES CIZARO FE').map(c => c.id)
    if (index === 7) categoryIds = categories.filter(c => c.name.toUpperCase() === 'SOPORTE SOFTLOGY').map(c => c.id)
    return { ...indicator, source: sources[index], categoryIds, days: index === 3 ? 7 : index === 11 ? 5 : 3,
      strictDays: index === 3 || index === 11, priorities: index === 1 ? ['NORMAL', 'HIGH'] : ['HIGH', 'URGENT'],
      note: index === 5 ? 'Confirma que Ultrafec corresponde a REVICIONES ALDELO FE.' : indicator.group === 'POS' ? 'Confirma las categorías incluidas en POS.' : '',
      confirmed: categoryIds.length > 0 && index !== 5 && indicator.group !== 'POS',
    }
  })
  return { month, leaderRole: role, leaderId: '', leaderName: leaderRoles[role], teamIds: staffIds, indicators }
}
