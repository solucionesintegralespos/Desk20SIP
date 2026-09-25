import { serviceDay } from './support/order-display'

export function dailyRange(from?: string | null, to?: string | null, now = new Date()) {
  const today = serviceDay(now.toISOString())
  const valid = (value?: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00-05:00`)
    return Number.isFinite(date.getTime()) && serviceDay(date.toISOString()) === value
  }
  const dateFrom = valid(from) ? from! : valid(to) ? to! : today
  const candidateTo = valid(to) ? to! : dateFrom
  const dateTo = candidateTo < dateFrom ? dateFrom : candidateTo
  return {
    dateFrom, dateTo,
    gte: new Date(`${dateFrom}T00:00:00-05:00`),
    lt: new Date(new Date(`${dateTo}T00:00:00-05:00`).getTime() + 86400000),
  }
}
