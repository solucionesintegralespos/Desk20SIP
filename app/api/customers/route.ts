import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

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

    // Solo AGENT y ADMIN pueden crear customers
    if (user?.role === 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    let { name, email, password, phone, location, address } = await request.json()

    if (!name) {
      return NextResponse.json(
        { error: 'El nombre es requerido' },
        { status: 400 }
      )
    }

    const enableCustomerUsersSetting = await prisma.setting.findUnique({ where: { key: 'ENABLE_CUSTOMER_USERS' } })
    const enableCustomerUsers = enableCustomerUsersSetting?.value === 'true'

    if (enableCustomerUsers) {
      if (!email) {
        email = `cliente_${Date.now()}_${Math.random().toString(36).substring(7)}@desk20.local`
      }
      if (!password) {
        password = Math.random().toString(36).slice(-8)
      }
    } else {
      email = email || undefined
      password = password || undefined
    }

    // Check if user exists (only if email is provided)
    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: { email }
      })

      if (existingUser) {
        return NextResponse.json(
          { error: 'El email ya está registrado' },
          { status: 400 }
        )
      }
    }

    // Hash password
    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined

    // Create customer (user with CUSTOMER role)
    const customer = await prisma.user.create({
      data: {
        name,
        email: email as any,
        password: hashedPassword as any,
        role: 'CUSTOMER',
        phone,
        location,
        address,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        location: true,
      }
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json(
      { error: 'Error al crear cliente' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
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

    // Solo AGENT y ADMIN pueden ver customers
    if (user?.role === 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    const customers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER'
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        location: true,
        address: true,
        createdAt: true,
        _count: {
          select: {
            createdTickets: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(customers)
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      { error: 'Error al obtener clientes' },
      { status: 500 }
    )
  }
}
