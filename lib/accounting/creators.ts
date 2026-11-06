import { prisma } from '@/lib/prisma'

export type Creator = { id: string; name: string }

/** Display names of the users who created a page of documents (one query for the whole page). */
export async function creatorsById(ids: Array<string | null | undefined>): Promise<Record<string, Creator>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => !!id)))
  if (!unique.length) return {}
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } })
  return Object.fromEntries(users.map(user => [user.id, { id: user.id, name: user.name || user.email || 'Usuario' }]))
}
