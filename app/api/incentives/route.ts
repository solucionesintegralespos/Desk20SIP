import { prisma } from '@/lib/prisma'
import { ServiceError, serviceError, serviceUser } from '@/lib/support/server'
import { calculatePlan, initialPlan, leaderRoles, planSchema, type IncentivePlan, type SavedIncentivePlan } from '@/lib/incentives'
import { incentiveMonth } from '@/lib/incentive-calculation'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'
const kind = 'incentive-month'
async function admin() {
  const user = await serviceUser()
  if (user.role !== 'ADMIN') throw new ServiceError('Solo los administradores pueden gestionar incentivos', 403)
  return user
}
async function results(plan: IncentivePlan, db: Prisma.TransactionClient = prisma) {
  const { start, end } = incentiveMonth(plan.month)
  const tickets = await db.ticket.findMany({ where: { createdAt: { ...(plan.indicators.some(i => i.source === 'backlog') ? {} : { gte: start }), lt: end }, OR: [
    { assignments: { some: { userId: { in: plan.teamIds } } } }, { assigneeId: { in: plan.teamIds } },
  ] }, select: { id: true, number: true, createdAt: true, closedAt: true, status: true, type: true, priority: true,
    categoryId: true, tags: true, assigneeId: true, assignments: { select: { userId: true } }, messages: { where: { type: 'SYSTEM' }, select: { content: true, createdAt: true } } } })
  return calculatePlan(plan, tickets)
}
export async function GET(request: Request) {
  try {
    await admin()
    const month = new URL(request.url).searchParams.get('month') || ''
    try { incentiveMonth(month) } catch { throw new ServiceError('Mes inválido') }
    const [records, staff, categories] = await Promise.all([
      prisma.serviceRecord.findMany({ where: { kind, id: { startsWith: `incentive:${month}:` } } }),
      prisma.user.findMany({ where: { role: { in: ['ADMIN', 'AGENT'] } }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
      prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    const plans = await Promise.all((Object.keys(leaderRoles) as IncentivePlan['leaderRole'][]).map(async role => {
      const record = records.find(r => r.id === `incentive:${month}:${role}`)
      const plan = record ? record.payload as unknown as SavedIncentivePlan : initialPlan(month, role, staff.map(p => p.id), categories)
      return { ...plan, revision: record?.revision || 0, results: plan.snapshot || await results(plan) }
    }))
    return Response.json({ plans, staff, categories })
  } catch (error) { return serviceError(error) }
}
export async function POST(request: Request) {
  try {
    const actor = await admin()
    const body = await request.json()
    if (!['save', 'close'].includes(body.action) || !Number.isInteger(body.revision) || body.revision < 0) throw new ServiceError('Operación inválida')
    const parsed = planSchema.safeParse(body.plan)
    if (!parsed.success) throw new ServiceError(parsed.error.issues.map(i => i.message).join('. '))
    const plan = parsed.data
    let range: ReturnType<typeof incentiveMonth>
    try { range = incentiveMonth(plan.month) } catch { throw new ServiceError('Mes inválido') }
    if (range.start > new Date()) throw new ServiceError('Selecciona el mes actual o un mes anterior')
    const people = await prisma.user.findMany({ where: { id: { in: [...plan.teamIds, plan.leaderId] }, role: { in: ['ADMIN', 'AGENT'] } }, select: { id: true, name: true, email: true } })
    if ([...plan.teamIds, ...(plan.leaderId ? [plan.leaderId] : [])].some(id => !people.some(p => p.id === id))) throw new ServiceError('Líder o equipo inválido')
    const categoryIds = Array.from(new Set(plan.indicators.flatMap(i => i.categoryIds)))
    if (await prisma.category.count({ where: { id: { in: categoryIds } } }) !== categoryIds.length) throw new ServiceError('Categoría inválida')
    const id = `incentive:${plan.month}:${plan.leaderRole}`
    await prisma.$transaction(async tx => {
      const existing = await tx.serviceRecord.findUnique({ where: { id } })
      if ((existing?.revision || 0) !== body.revision) throw new ServiceError('Otra persona actualizó este mes. Recarga antes de guardar.', 409)
      const previous = existing?.payload as unknown as SavedIncentivePlan | undefined
      if (previous?.closedAt) throw new ServiceError('La liquidación está cerrada y conserva sus valores originales.', 409)
      const payload: SavedIncentivePlan = { ...plan, leaderName: leaderRoles[plan.leaderRole] }
      if (body.action === 'close') {
        if (!plan.leaderId || !plan.indicators.length) throw new ServiceError('Asigna el líder responsable y define sus indicadores antes de cerrar')
        if (range.end > new Date()) throw new ServiceError('Solo puedes cerrar la liquidación cuando termine el mes')
        const snapshot = await results(plan, tx)
        if (snapshot.rows.some(row => row.status === 'pending')) throw new ServiceError('Confirma las reglas y completa los datos pendientes antes de cerrar')
        payload.closedAt = new Date().toISOString()
        payload.closedBy = actor.name || actor.email || actor.id
        payload.snapshot = snapshot
      }
      const data = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue
      if (existing) {
        const updated = await tx.serviceRecord.updateMany({ where: { id, revision: body.revision }, data: { payload: data, revision: { increment: 1 } } })
        if (updated.count !== 1) throw new ServiceError('Otra persona actualizó este mes. Recarga antes de guardar.', 409)
      } else await tx.serviceRecord.create({ data: { id, kind, payload: data } })
      await tx.serviceAuditEvent.create({ data: { actorId: actor.id, entityId: id, action: body.action === 'close' ? 'incentive-month:closed' : 'incentive-month:saved' } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return Response.json({ error: 'El mes cambió en otra sesión. Recarga e intenta nuevamente.' }, { status: 409 })
    return serviceError(error)
  }
}
