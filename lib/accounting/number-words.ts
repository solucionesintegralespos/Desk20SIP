// Spanish amount in words for cuentas de cobro: "Ciento setenta y seis mil pesos m/c".

const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function belowThousand(n: number, apocope: boolean): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const parts: string[] = []
  const hundreds = Math.floor(n / 100), rest = n % 100
  if (hundreds) parts.push(HUNDREDS[hundreds])
  if (rest < 30) {
    let word = UNITS[rest]
    if (apocope && rest === 21) word = 'veintiún'
    if (apocope && rest === 1) word = 'un'
    if (word) parts.push(word)
  } else {
    const tens = Math.floor(rest / 10), units = rest % 10
    parts.push(units ? `${TENS[tens]} y ${apocope && units === 1 ? 'un' : UNITS[units]}` : TENS[tens])
  }
  return parts.join(' ')
}

/** Integer 0..999 999 999 999 in words (lowercase). `apocope` shortens a final "uno" to "un" (before a noun). */
export function numberToWords(value: number, apocope = false): string {
  const n = Math.floor(Math.abs(value))
  if (n === 0) return 'cero'
  const billions = Math.floor(n / 1000000000), millions = Math.floor(n / 1000000) % 1000
  const thousands = Math.floor(n / 1000) % 1000, rest = n % 1000
  const parts: string[] = []
  if (billions) parts.push(billions === 1 ? 'mil millones' : `${belowThousand(billions, true)} mil millones`)
  if (millions) parts.push(millions === 1 ? 'un millón' : `${belowThousand(millions, true)} millones`)
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${belowThousand(thousands, true)} mil`)
  if (rest) parts.push(belowThousand(rest, apocope))
  return parts.join(' ')
}

/** "Ciento setenta y seis mil pesos m/c"; cents are spelled when present. */
export function amountInWords(cents: number) {
  const pesos = Math.floor(Math.abs(cents) / 100), centavos = Math.abs(cents) % 100
  const words = numberToWords(pesos, true)
  const text = `${words} ${pesos === 1 ? 'peso' : 'pesos'}${centavos ? ` con ${numberToWords(centavos, true)} ${centavos === 1 ? 'centavo' : 'centavos'}` : ''} m/c`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
