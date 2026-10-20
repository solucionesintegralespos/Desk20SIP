// Fixed-window attempt limiter kept in process memory. It protects a single server
// (the current `npm start` deployment); several instances or serverless functions
// would each keep their own counters and need a shared store such as Redis instead.
type Bucket = { count: number; reset: number }
const buckets = new Map<string, Bucket>()

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (buckets.size > 10000) for (const [name, bucket] of Array.from(buckets)) if (bucket.reset <= now) buckets.delete(name)
  const bucket = buckets.get(key)
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  bucket.count++
  return bucket.count > limit ? { ok: false, retryAfter: Math.ceil((bucket.reset - now) / 1000) } : { ok: true, retryAfter: 0 }
}

/** Every key must pass; one call per attempt counts against all of them. */
export function rateLimitAll(rules: Array<[key: string, limit: number, windowMs: number]>, now = Date.now()) {
  const results = rules.map(([key, limit, windowMs]) => rateLimit(key, limit, windowMs, now))
  const blocked = results.filter(result => !result.ok)
  return blocked.length ? { ok: false, retryAfter: Math.max(...blocked.map(result => result.retryAfter)) } : { ok: true, retryAfter: 0 }
}

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined
export function clientIp(headers: HeaderSource) {
  const read = (name: string) => {
    if (!headers) return undefined
    if (headers instanceof Headers) return headers.get(name) || undefined
    const value = headers[name]
    return Array.isArray(value) ? value[0] : value
  }
  return read('x-forwarded-for')?.split(',')[0].trim() || read('x-real-ip') || 'local'
}

export function tooManyRequests(retryAfter: number, message = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.') {
  return Response.json({ error: message }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
}

const MINUTE = 60 * 1000
// Sign-in, 2FA pre-checks and code verification share these limits so none of them becomes
// a way to guess passwords or codes.
export const LOGIN_LIMITS = (email: string, ip: string): Array<[string, number, number]> => [
  [`login:email:${email.trim().toLowerCase()}`, 20, 15 * MINUTE],
  [`login:ip:${ip}`, 50, 15 * MINUTE],
]
export const TWO_FACTOR_LIMITS = (email: string): Array<[string, number, number]> => [
  [`2fa:email:${email.trim().toLowerCase()}`, 10, 15 * MINUTE],
]
export { MINUTE }
