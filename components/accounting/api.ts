// Small fetch helper for the accounting screens: JSON in, JSON out, server message on error.
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {}
  const response = await fetch(url, {
    cache: 'no-store', ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const text = await response.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error || 'No se pudo completar la operación')
  return data as T
}

export type CustomerOption = { id: string; name: string; businessName: string | null; taxId: string | null; email: string | null; phone: string | null; address: string | null; city: string | null }
export type CompanyBranding = { company: { name: string; nit: string; phone: string; email: string; website: string; address: string; city: string; paymentInfo: string; legalNote: string; quoteConditions: string; billingDueDays: number }; logo: { dataUrl: string; format: 'PNG' | 'JPEG' } | null }
