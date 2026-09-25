import { orderDocument } from '@/lib/order-email'
import { orderPdf } from '@/lib/order-pdf'
import { verifyOrderLink } from '@/lib/order-link'

export const dynamic = 'force-dynamic'
// Opened from the customer email; the signed, expiring link replaces a session.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url)
  if (!verifyOrderLink(params.id, url.searchParams.get('exp'), url.searchParams.get('sig')))
    return Response.json({ error: 'El enlace no es válido o expiró' }, { status: 404 })
  try {
    const document = await orderDocument(params.id)
    if (!document) return Response.json({ error: 'El enlace no es válido o expiró' }, { status: 404 })
    const pdf = await orderPdf(document.data)
    const name = `orden-${(document.data.number || 'servicio').replace(/[^a-zA-Z0-9-]/g, '')}.pdf`
    return new Response(new Uint8Array(pdf), { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    } })
  } catch (error) {
    console.error(`[ORDER_PDF] order_id=${params.id} no se pudo generar el PDF`, error)
    return Response.json({ error: 'No se pudo generar el documento' }, { status: 503 })
  }
}
