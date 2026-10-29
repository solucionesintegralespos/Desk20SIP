import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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
    if (!user || !['AGENT', 'ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    const customer = await prisma.user.findUnique({
      where: {
        id: params.id,
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
      }
    })

    if (!customer) {
      return NextResponse.json(
        { error: 'Cliente no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json(
      { error: 'Error al obtener cliente' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    // Solo AGENT y ADMIN pueden editar customers
    if (!user || !['AGENT', 'ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    const data = await request.json()
    let customerEmail: string | null | undefined
    if ('email' in data) {
      if (typeof data.email === 'string' && data.email.trim()) {
        const trimmedEmail = data.email.trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          return NextResponse.json({ error: 'Ingresa un correo válido' }, { status: 400 })
        }
        const existing = await prisma.user.findFirst({
          where: {
            email: { equals: trimmedEmail, mode: 'insensitive' },
            NOT: { id: params.id }
          },
          select: { id: true }
        })
        if (existing) return NextResponse.json({ error: 'El correo ya está registrado' }, { status: 409 })
        customerEmail = trimmedEmail
      } else {
        customerEmail = null
      }
    }
      if ('name' in data) {
        if (typeof data.name !== 'string' || !data.name.trim()) {
          return NextResponse.json({ error: 'El nombre del cliente es obligatorio' }, { status: 400 })
        }
        const trimmedName = data.name.trim()
        const existingCustomerByName = await prisma.user.findFirst({
          where: {
            name: { equals: trimmedName, mode: 'insensitive' },
            role: 'CUSTOMER',
            NOT: { id: params.id }
          },
          select: { id: true }
        })
        if (existingCustomerByName) {
          return NextResponse.json({ error: 'Ya existe un cliente con este nombre' }, { status: 409 })
        }
      }

      const customer = await prisma.user.update({
        where: {
          id: params.id,
          role: 'CUSTOMER'
        },
        data: {
          name: 'name' in data && typeof data.name === 'string' ? data.name.trim() : data.name,
          ...(customerEmail !== undefined ? { email: customerEmail } : {}),
          phone: data.phone,
          location: data.location,
          address: data.address,
          emailNotifications: data.emailNotifications,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          location: true,
          address: true,
          emailNotifications: true,
        }
      })

      return NextResponse.json(customer)
    } catch (error) {
      console.error('Error updating customer:', error)
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') return NextResponse.json({ error: 'El correo ya está registrado' }, { status: 409 })
        if (error.code === 'P2025') return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
      }
      return NextResponse.json(
        { error: 'Error al actualizar cliente' },
        { status: 500 }
      )
    }
  }

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
  ) {
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

      // Solo AGENT y ADMIN pueden eliminar customers
      if (user?.role === 'CUSTOMER') {
        return NextResponse.json(
          { error: 'Acceso denegado' },
          { status: 403 }
        )
      }

      await prisma.user.delete({
        where: {
          id: params.id,
          role: 'CUSTOMER'
        }
      })

      return NextResponse.json({ message: 'Cliente eliminado' })
    } catch (error) {
      console.error('Error deleting customer:', error)
      return NextResponse.json(
        { error: 'Error al eliminar cliente' },
        { status: 500 }
      )
    }
  }
