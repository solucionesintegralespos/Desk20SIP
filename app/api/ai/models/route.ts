import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAvailableGeminiModelsDetailed } from '@/lib/ai'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acceso denegado. Solo administradores pueden listar modelos de IA.' }, { status: 403 })
    }

    const { apiKey } = await request.json()

    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json({ error: 'Ingresa una API Key para detectar modelos.' }, { status: 400 })
    }

    const result = await getAvailableGeminiModelsDetailed(apiKey.trim())
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error al detectar modelos de Gemini:', error)
    return NextResponse.json(
      { error: error?.message || 'Error al obtener modelos de Google Gemini' },
      { status: 400 }
    )
  }
}
