'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Plus, Download, Eye, FileText, Search, Mail, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, type CustomerOption } from './api'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui'
import { SearchSelect } from '@/components/ui/SearchSelect'
import Pagination from '@/components/tickets/Pagination'
import { formatMoney, formatDateTimeCO } from '@/lib/accounting/format'
import type { SerializedQuote } from '@/lib/accounting/quotes'

type ListResponse = { quotes: SerializedQuote[]; total: number; page: number; perPage: number }
type EmailResult = { status: 'sent' | 'skipped' | 'failed'; recipient: string | null; message: string }
type Customer = Pick<CustomerOption, 'id' | 'name' | 'businessName' | 'taxId' | 'email'>

export default function QuotesList() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const q = searchParams.get('q') || ''
  const customer = searchParams.get('customer') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

  const [searchTerm, setSearchTerm] = useState(q)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [emailing, setEmailing] = useState<SerializedQuote | null>(null)
  const [sending, setSending] = useState(false)

  async function sendEmail() {
    if (!emailing || sending) return
    setSending(true)
    try {
      const { email } = await api<{ email: EmailResult }>(`/api/quotes/${encodeURIComponent(emailing.id)}/email`, { method: 'POST' })
      setEmailing(null)
      if (email.status === 'sent') toast.success(email.message, { duration: 6000 })
      else if (email.status === 'skipped') toast(email.message, { icon: '⚠️', duration: 8000 })
      else toast.error(email.message, { duration: 8000 })
    } catch (e) { toast.error((e as Error).message) }
    finally { setSending(false) }
  }
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { setSearchTerm(q) }, [q])

  useEffect(() => {
    api<Customer[]>('/api/customers').then(list => setCustomers(list)).catch(() => setCustomers([]))
  }, [])

  const query = searchParams.toString()
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/quotes${query ? `?${query}` : ''}`, { cache: 'no-store', signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las cotizaciones')
      if (!signal.aborted) setData(result)
    } catch (e) {
      if (!signal.aborted) setError((e as Error).message)
    } finally { if (!signal.aborted) setLoading(false) }
  }, [query])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])

  // Filters live in the URL, so paging, back/forward and shared links keep them.
  const navigate = (change: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    change(params)
    const next = params.toString()
    router.push(`${pathname}${next ? `?${next}` : ''}`)
  }
  const updateFilter = (key: string, value: string) => navigate(params => { if (value) params.set(key, value); else params.delete(key) })
  const hasFilters = !!(q || customer || from || to)

  const customerOptions = useMemo(() => customers.map(c => ({ id: c.id, label: c.businessName || c.name || c.email || 'Sin nombre', description: [c.name !== c.businessName ? c.name : '', c.taxId ? `NIT/CC ${c.taxId}` : '', c.email].filter(Boolean).join(' · ') || undefined })), [customers])
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Cotizaciones</h1>
        <p className="text-gray-600 mt-1">Crea, consulta y envía cotizaciones a tus clientes</p>
      </div>
      <Link href="/dashboard/quotes/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
        <Plus className="h-4 w-4" /> Nueva cotización
      </Link>
    </div>

    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <form onSubmit={e => { e.preventDefault(); updateFilter('q', searchTerm.trim()) }} className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="relative flex-1 min-w-[200px]">
          <label htmlFor="quote-search" className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
          <Search className="absolute left-3 bottom-2.5 h-5 w-5 text-gray-400" />
          <input id="quote-search" type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Número (COT-0001) o cliente…"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="w-full md:w-72">
          <span className="block text-sm font-medium text-gray-700 mb-1">Cliente</span>
          <SearchSelect aria-label="Cliente" placeholder="Buscar cliente…" emptyOption="Todos los clientes" value={customer} onChange={id => updateFilter('customer', id)} options={customerOptions} />
        </div>
        <div className="flex items-end gap-2">
          <label className="text-sm font-medium text-gray-700">Desde
            <input type="date" value={from} max={to || undefined} onChange={e => updateFilter('from', e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </label>
          <label className="text-sm font-medium text-gray-700">Hasta
            <input type="date" value={to} min={from || undefined} onChange={e => updateFilter('to', e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500">Buscar</button>
          {hasFilters && <button type="button" onClick={() => { setSearchTerm(''); router.push(pathname) }} className="px-3 py-2 text-sm text-primary-600 hover:text-primary-700 font-medium">Limpiar filtros</button>}
        </div>
      </form>
    </div>

    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700 mb-4">{error} <button type="button" className="underline" onClick={() => { const c = new AbortController(); void load(c.signal) }}>Reintentar</button></p>}

    {loading && !data ? <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">Cargando cotizaciones…</div>
      : !data || data.quotes.length === 0 ? <div className="bg-white rounded-lg shadow p-12 text-center">
        <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-lg">No se encontraron cotizaciones</p>
        <p className="text-gray-400 mt-2">{hasFilters ? 'Ajusta los filtros o crea una nueva cotización' : 'Crea tu primera cotización con el botón «Nueva cotización»'}</p>
      </div>
      : <div className={`bg-white rounded-lg shadow overflow-hidden ${loading ? 'opacity-60' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Número', 'Fecha', 'Cliente', 'Subtotal', 'Impuesto', 'Total', 'Acciones'].map((label, index) => (
                  <th key={label} scope="col" className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${index >= 3 && index <= 5 ? 'text-right' : 'text-left'}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.quotes.map(quote => (
                <tr key={quote.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/dashboard/quotes/${quote.id}`} className="text-primary-600 font-medium hover:underline">{quote.numberLabel}</Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDateTimeCO(quote.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{quote.customer.businessName || quote.customer.name}</div>
                    <div className="text-xs text-gray-500">{[quote.customer.businessName && quote.customer.businessName !== quote.customer.name ? quote.customer.name : '', quote.customer.taxId ? `NIT/CC ${quote.customer.taxId}` : '', quote.customer.email || ''].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 tabular-nums">{formatMoney(quote.subtotalCents)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 tabular-nums">{quote.taxName ? `${formatMoney(quote.taxCents)}` : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900 tabular-nums">{formatMoney(quote.totalCents)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Link href={`/dashboard/quotes/${quote.id}`} title="Ver cotización" aria-label={`Ver ${quote.numberLabel}`} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-primary-600"><Eye className="h-4 w-4" /></Link>
                      <a href={`/api/quotes/${quote.id}/pdf`} title="Descargar PDF" aria-label={`Descargar PDF de ${quote.numberLabel}`} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-primary-600"><Download className="h-4 w-4" /></a>
                      <button type="button" onClick={() => setEmailing(quote)} disabled={!quote.customer.email} title={quote.customer.email ? `Enviar por correo a ${quote.customer.email}` : 'La cotización no tiene correo de destino'} aria-label={`Enviar ${quote.numberLabel} por correo`} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"><Mail className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

    {data && <Pagination currentPage={page} totalPages={totalPages} totalCount={data.total} perPage={data.perPage} itemLabel="cotizaciones" />}

    <Dialog open={!!emailing} onOpenChange={open => { if (!open && !sending) setEmailing(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enviar cotización por correo</DialogTitle><DialogDescription>Se enviará la cotización <strong>{emailing?.numberLabel}</strong> con el PDF adjunto a <strong>{emailing?.customer.email}</strong>.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={sending} onClick={() => setEmailing(null)}>Cancelar</Button>
          <Button disabled={sending} onClick={() => void sendEmail()}>{sending ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : <><Mail size={16} /> Enviar</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
