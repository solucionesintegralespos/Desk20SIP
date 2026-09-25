import { createHmac, timingSafeEqual } from 'crypto'

// Customers have no dashboard access, so the email links to a signed, expiring PDF URL.
const TTL_MS = 90 * 24 * 60 * 60 * 1000
const signature = (orderId: string, exp: number, secret: string) =>
  createHmac('sha256', secret).update(`order-pdf:${orderId}:${exp}`).digest('base64url')

export function orderPdfUrl(orderId: string, now = Date.now()) {
  const secret = process.env.NEXTAUTH_SECRET
  const base = process.env.APP_PUBLIC_URL || process.env.NEXTAUTH_URL
  if (!secret || !base) return undefined
  const exp = Math.floor((now + TTL_MS) / 1000)
  try {
    const url = new URL(`/api/public/orders/${encodeURIComponent(orderId)}/pdf`, base)
    url.searchParams.set('exp', String(exp))
    url.searchParams.set('sig', signature(orderId, exp, secret))
    return url.toString()
  } catch { return undefined }
}

export function verifyOrderLink(orderId: string, exp: string | null, sig: string | null, now = Date.now()) {
  const secret = process.env.NEXTAUTH_SECRET
  const expires = Number(exp)
  if (!secret || !sig || !Number.isInteger(expires) || expires * 1000 < now) return false
  const expected = Buffer.from(signature(orderId, expires, secret))
  const received = Buffer.from(sig)
  return expected.length === received.length && timingSafeEqual(expected, received)
}
