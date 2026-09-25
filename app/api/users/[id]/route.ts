import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { validateUserPerformance } from '@/lib/user-performance'

export { POST } from '../route'

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
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email || '' },
      select: { role: true }
    })

    // Solo ADMIN puede editar usuarios
    if (currentUser?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    const data = await request.json()
    const invalid = validateUserPerformance(data)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    const { name, role, phone, location, password } = data

    if (role && !['ADMIN', 'AGENT'].includes(role)) return NextResponse.json({ error: 'Los clientes se gestionan en Clientes' }, { status: 400 })

    const updateData: any = {
      avatar: data.avatar === '' ? null : data.avatar,
      dailyEntryGoal: data.dailyEntryGoal,
      dailyClosureGoal: data.dailyClosureGoal,
      name,
      role,
      phone,
      location,
    }

    // If password is provided, hash it
    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          { error: 'La contraseña debe tener al menos 6 caracteres' },
          { status: 400 }
        )
      }
      updateData.password = await bcrypt.hash(password, 10)
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        location: true,
      }
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Error al actualizar usuario' },
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
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email || '' },
      select: { id: true, role: true }
    })

    // Solo ADMIN puede eliminar usuarios
    if (currentUser?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    // Prevent users from deleting themselves
    if (params.id === currentUser.id) {
      return NextResponse.json(
        { error: 'No puedes eliminar tu propia cuenta' },
        { status: 403 }
      )
    }

    await prisma.user.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ message: 'Usuario eliminado' })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json(
      { error: 'Error al eliminar usuario' },
      { status: 500 }
    )
  }
}
