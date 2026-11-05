'use client'
import { useEffect, useState } from 'react'
import type { InputHTMLAttributes } from 'react'

// Currency field for pesos: the value is formatted with thousands separators while typing
// ("520.000", "1.234,56") and reported in integer cents. Empty input reports null.
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const clean = (raw: string) => raw.replace(/[^0-9,]/g, '')

/** Text as the user typed it → cents, or null when empty. Accepts "520.000", "520000" and "1.234,5". */
export function parseMoneyText(raw: string): number | null {
  const cleaned = clean(raw)
  if (!cleaned.replace(/,/g, '')) return null
  const [whole = '', ...rest] = cleaned.split(',')
  const decimals = rest.join('').slice(0, 2).padEnd(2, '0')
  const cents = Number(whole || '0') * 100 + Number(decimals)
  return Number.isSafeInteger(cents) ? cents : null
}

/** Cents → display text ("520.000" or "1.234,56"). */
export function formatMoneyText(cents: number | null) {
  if (cents == null) return ''
  const whole = Math.floor(Math.abs(cents) / 100), fraction = Math.abs(cents) % 100
  return fraction ? `${group(String(whole))},${String(fraction).padStart(2, '0')}` : group(String(whole))
}

/** Formats while typing, keeping a trailing comma and partial decimals the user is still writing. */
function formatTyping(raw: string) {
  const cleaned = clean(raw)
  const comma = cleaned.indexOf(',')
  const whole = (comma >= 0 ? cleaned.slice(0, comma) : cleaned).replace(/^0+(?=\d)/, '')
  const decimals = comma >= 0 ? cleaned.slice(comma + 1).replace(/,/g, '').slice(0, 2) : null
  return `${group(whole)}${decimals === null ? '' : `,${decimals}`}`
}

export function MoneyInput({ valueCents, onChange, className = '', invalid, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  valueCents: number | null
  onChange: (cents: number | null) => void
  invalid?: boolean
}) {
  const [text, setText] = useState(formatMoneyText(valueCents))
  // Keep the text in step with external changes (e.g. a product chosen from the catalog).
  useEffect(() => { setText(current => parseMoneyText(current) === valueCents ? current : formatMoneyText(valueCents)) }, [valueCents])
  return <div className={`relative ${className}`}>
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">$</span>
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      aria-invalid={invalid || undefined}
      onChange={event => { const raw = event.target.value; setText(formatTyping(raw)); onChange(parseMoneyText(raw)) }}
      onBlur={event => { setText(formatMoneyText(parseMoneyText(event.target.value))); props.onBlur?.(event) }}
      className={`w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500 ${invalid ? 'border-red-400' : ''}`}
    />
  </div>
}
