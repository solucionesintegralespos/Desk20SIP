// Validation of the optional billing identity of customers (shared by create and update).
export function parseBillingText(value: unknown, label: string): { value: string | null } | { error: string } {
  if (value === undefined || value === null) return { value: null }
  if (typeof value !== 'string') return { error: `${label} no es válido` }
  const trimmed = value.trim()
  if (trimmed.length > 200) return { error: `${label} no puede superar 200 caracteres` }
  return { value: trimmed || null }
}

/** Empty means "not provided"; otherwise it must be an integer between 1 and 1 000 000. */
export function parseBillingStartNumber(value: unknown): { value: number | undefined } | { error: string } {
  if (value === undefined || value === null || value === '') return { value: undefined }
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^[0-9]+$/.test(text)) return { error: 'El número inicial debe ser un entero mayor o igual a 1' }
  const number = Number(text)
  if (!Number.isSafeInteger(number) || number < 1 || number > 1000000) return { error: 'El número inicial debe ser un entero mayor o igual a 1' }
  return { value: number }
}
