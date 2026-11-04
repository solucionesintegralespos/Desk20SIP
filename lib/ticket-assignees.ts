import { prisma } from '@/lib/prisma'
import { STAFF_ROLES } from '@/lib/roles'

export const assignmentInclude = {
  include: { user: { select: { id: true, name: true, email: true } } },
} as const

export async function validateAssignees(value: unknown): Promise<string[]> {
  if (!Array.isArray(value) || !value.length || value.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Selecciona al menos un técnico')
  }
  const ids = Array.from(new Set(value as string[]))
  const count = await prisma.user.count({ where: { id: { in: ids }, role: { in: STAFF_ROLES } } })
  if (count !== ids.length) throw new Error('Los técnicos seleccionados no son válidos')
  return ids
}

