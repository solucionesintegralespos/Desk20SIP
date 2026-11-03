import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { orderDocument } from '@/lib/order-email'
import { orderPdf } from '@/lib/order-pdf'

export const dynamic = 'force-dynamic'

// Authenticated endpoint for staff to download the service order PDF
// (the same PDF that is sent by email to the customer).
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const actor = await prisma.user.findFirst({
    where: {
      OR: [
        { id: session.user.id ?? '' },
        { email: session.user.email ?? '' },
      ],
    },
    select: { role: true },
  })

  if (!actor || actor.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  try {
    const document = await orderDocument(params.id)
    if (!document) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    const pdf = await orderPdf(document.data)
    const name = `orden-${(document.data.number || params.id).replace(/[^a-zA-Z0-9-]/g, '')}.pdf`

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error(`[ORDER_PDF_STAFF] order_id=${params.id}`, error)
    return NextResponse.json({ error: 'No se pudo generar el documento' }, { status: 503 })
  }
}

