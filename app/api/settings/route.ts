import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Obtener usuario con su rol
    const user = await prisma.user.findUnique({
      where: { email: session.user.email || '' },
      select: { role: true }
    })

    // Solo ADMIN puede acceder a la configuración
    if (user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    // Obtener todas las configuraciones
    const settings = await prisma.setting.findMany()

    // Convertir a objeto clave-valor
    const settingsObject = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)

    return NextResponse.json(settingsObject)
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Obtener usuario con su rol
    const user = await prisma.user.findUnique({
      where: { email: session.user.email || '' },
      select: { role: true }
    })

    // Solo ADMIN puede modificar la configuración
    if (user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Soporte para guardar múltiples configuraciones a la vez
    if (body.settings && typeof body.settings === 'object') {
      const entries = Object.entries(body.settings)
      const results = []
      for (const [key, val] of entries) {
        if (!key) continue
        const stringVal = val === null || val === undefined ? '' : String(val)
        const updated = await prisma.setting.upsert({
          where: { key },
          update: { value: stringVal },
          create: { key, value: stringVal },
        })
        results.push(updated)
      }
      return NextResponse.json({ success: true, count: results.length, settings: results })
    }

    const { key, value } = body

    if (!key) {
      return NextResponse.json(
        { error: 'La clave es requerida' },
        { status: 400 }
      )
    }

    // Crear o actualizar configuración
    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: value === null || value === undefined ? '' : String(value) },
      create: { key, value: value === null || value === undefined ? '' : String(value) },
    })

    return NextResponse.json(setting)
  } catch (error) {
    console.error('Error saving setting:', error)
    return NextResponse.json(
      { error: 'Error al guardar configuración' },
      { status: 500 }
    )
  }
}
