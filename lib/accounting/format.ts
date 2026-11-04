// Client-safe helpers shared by the accounting screens, the PDF engine and the API.
// Money is handled in integer cents: no floating point arithmetic reaches a document.

export const toCents = (value: number | string | null | undefined) => {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}
export const fromCents = (cents: number) => cents / 100

/** "$520.000" for whole pesos, "$1.234,50" when there are cents. */
export function formatMoney(cents: number) {
  const whole = cents % 100 === 0
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100)
}
export const formatNumber = (value: number, decimals = 2) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value)

/** Billing account numbers are digits only: 01..09, then 10, 11, ... 100, 101. */
export const formatBillingNumber = (number: number) => String(number).padStart(2, '0')
export const formatQuoteNumber = (number: number) => `COT-${String(number).padStart(4, '0')}`

/** quantity may have two decimals; the result is rounded to the cent once. */
export function lineTotalCents(quantity: number, unitPriceCents: number) {
  const hundredths = Math.round(quantity * 100)
  return Math.round(hundredths * unitPriceCents / 100)
}

export interface QuoteLineInput { quantity: number; unitPriceCents: number }
export function quoteTotals(items: QuoteLineInput[], taxRatePercent: number | null | undefined) {
  const lines = items.map(item => lineTotalCents(item.quantity, item.unitPriceCents))
  const subtotalCents = lines.reduce((sum, value) => sum + value, 0)
  // The percentage is kept with four decimals (basis points of a basis point): 19 % -> 190000.
  const rate = taxRatePercent == null ? 0 : Math.round(taxRatePercent * 10000)
  const taxCents = Math.round(subtotalCents * rate / 1000000)
  return { lines, subtotalCents, taxCents, totalCents: subtotalCents + taxCents }
}

const zone = { timeZone: 'America/Bogota' } as const
/** YYYY-MM in Colombia; the billing period of recurring accounts. */
export function currentPeriod(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { ...zone, year: 'numeric', month: '2-digit' }).format(date)
}
export const isPeriod = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
export function periodLabel(period: string) {
  if (!isPeriod(period)) return period
  const [year, month] = period.split('-').map(Number)
  const label = new Intl.DateTimeFormat('es-CO', { ...zone, month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 15)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}
export function previousPeriod(period: string) {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 2, 15))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
export function nextPeriod(period: string) {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(Date.UTC(year, month, 15))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const validDate = (value: string | Date | null | undefined) => value != null && Number.isFinite(new Date(value).getTime())
/** "4 de noviembre de 2026" */
export const formatDateCO = (value: string | Date | null | undefined) => validDate(value) ? new Intl.DateTimeFormat('es-CO', { ...zone, dateStyle: 'long' }).format(new Date(value!)) : ''
/** "04/11/2026" */
export const formatShortDateCO = (value: string | Date | null | undefined) => validDate(value) ? new Intl.DateTimeFormat('es-CO', { ...zone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value!)) : ''
export const formatDateTimeCO = (value: string | Date | null | undefined) => validDate(value) ? new Intl.DateTimeFormat('es-CO', { ...zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value!)) : ''
