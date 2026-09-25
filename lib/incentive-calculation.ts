/** Monthly incentive arithmetic. Missing data must never be treated as compliance. */
export type IncentiveDirection = 'at_least' | 'at_most'

export interface IncentiveInput {
  numerator: number | null
  denominator: number | null
  target: number
  amount: number
  direction: IncentiveDirection
}

export function incentiveResult(input: IncentiveInput) {
  const { numerator, denominator, target, amount, direction } = input
  if (!Number.isFinite(target) || target < 0 || !Number.isSafeInteger(amount) || amount < 0 || !['at_least', 'at_most'].includes(direction)) {
    throw new Error('Meta, valor o comparación del indicador inválidos')
  }
  if ([numerator, denominator].some(value => value !== null && (!Number.isFinite(value) || value < 0))) {
    throw new Error('Los datos del indicador deben ser números no negativos')
  }
  if (numerator === null || denominator === null || denominator === 0) {
    return { percentage: null, status: 'pending' as const, payout: 0 }
  }
  const percentage = numerator / denominator * 100
  // Compare raw values, not the rounded percentage displayed in the table.
  const meets = direction === 'at_least' ? numerator * 100 >= denominator * target : numerator * 100 <= denominator * target
  return { percentage, status: meets ? 'met' as const : 'unmet' as const, payout: meets ? amount : 0 }
}

export function incentiveMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes inválido')
  const [year, number] = month.split('-').map(Number)
  if (year < 2000 || year > 2100) throw new Error('Año inválido')
  return { start: new Date(Date.UTC(year, number - 1, 1, 5)), end: new Date(Date.UTC(year, number, 1, 5)) }
}
