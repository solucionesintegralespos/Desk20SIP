'use client'
import { useSyncExternalStore } from 'react'

// The ticket list keeps its filters in the URL. The last query is remembered per tab
// so links back to the list (from a ticket, the menu or the create form) restore it.
export const TICKETS_PATH = '/dashboard/tickets'
const KEY = 'sip-tickets-list-query'
const EVENT = 'sip-tickets-list-query'

function read() {
  try { return sessionStorage.getItem(KEY) || '' } catch { return '' }
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

export function rememberTicketsQuery(query: string) {
  try { if (query) sessionStorage.setItem(KEY, query); else sessionStorage.removeItem(KEY) } catch { /* Storage disabled: links fall back to the unfiltered list. */ }
  window.dispatchEvent(new Event(EVENT))
}

export function useTicketsListHref() {
  const query = useSyncExternalStore(subscribe, read, () => '')
  return query ? `${TICKETS_PATH}?${query}` : TICKETS_PATH
}
