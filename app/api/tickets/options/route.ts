import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  if (!await getServerSession(authOptions)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const agents = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'AGENT'] } }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } })
  const categories = await prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  return NextResponse.json({ agents, categories })
}
