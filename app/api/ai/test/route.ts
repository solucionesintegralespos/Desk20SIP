import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { testAIConnection } from '@/lib/ai'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acceso denegado. Solo administradores pueden probar la configuración de IA.' },
        { status: 403 }
      )
    }

    const { apiKey, provider, model } = await request.json()

    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json(
        { error: 'Por favor ingresa una API Key para probar.' },
        { status: 400 }
      )
    }

    const result = await testAIConnection({
      apiKey: apiKey.trim(),
      provider,
      model
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error al probar conexión con IA:', error)
    return NextResponse.json(
      { error: error?.message || 'Error al conectar con el proveedor de IA' },
      { status: 400 }
    )
  }
}
