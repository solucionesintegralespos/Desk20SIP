import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const message = await prisma.message.findUnique({
      where: { id: params.id },
      include: { author: true }
    })

    if (!message) {
      return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 })
    }

    if (message.author.email !== session.user.email) {
      return NextResponse.json({ error: 'No tienes permiso para eliminar este mensaje' }, { status: 403 })
    }

    // Check if within 1 minute
    if (Date.now() - new Date(message.createdAt).getTime() > 60000) {
      return NextResponse.json({ error: 'El tiempo límite para eliminar (1 minuto) ha expirado' }, { status: 403 })
    }

    await prisma.message.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting message:', error)
    return NextResponse.json({ error: 'Error al eliminar el mensaje' }, { status: 500 })
  }
}
