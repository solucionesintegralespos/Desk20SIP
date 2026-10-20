import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { rateLimitAll, clientIp, tooManyRequests, LOGIN_LIMITS } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      )
    }
    // This endpoint checks passwords too, so it shares the sign-in attempt limits.
    const limit = rateLimitAll(LOGIN_LIMITS(email, clientIp(request.headers)))
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        twoFactorEnabled: true,
        active: true
      }
    })

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    // Do not ask an inactive user for a 2FA code; the sign-in reports the inactive account.
    if (!user.active) {
      return NextResponse.json({ error: 'Tu usuario está inactivo. Contacta a un administrador.' }, { status: 403 })
    }

    return NextResponse.json({
      requires2FA: user.twoFactorEnabled,
      userId: user.id
    })
  } catch (error) {
    console.error('Error al verificar 2FA:', error)
    return NextResponse.json(
      { error: 'Error al verificar 2FA' },
      { status: 500 }
    )
  }
}
