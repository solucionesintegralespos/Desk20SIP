'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Plus, Repeat, Download, Eye, Mail, Link2, Ban, Copy, RefreshCw, Search, Filter } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Textarea } from '@/components/support/ui'
import { SearchSelect } from '@/components/ui/SearchSelect'
import Pagination from '@/components/tickets/Pagination'
import { PdfPreview } from './PdfPreview'
import { api, type CustomerOption } from './api'
import type { SerializedAccount } from '@/lib/accounting/billing'
import { formatMoney, formatShortDateCO, formatDateCO, periodLabel } from '@/lib/accounting/format'

type Totals = { count: number; issuedCount: number; voidCount: number; issuedCents: number; voidCents: number }
type ListResponse = { accounts: SerializedAccount[]; total: number; page: number; perPage: number; totals?: Totals }
type EmailResult = { status: 'sent' | 'failed' | 'skipped'; recipient: string | null; message: string }
const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm'

export default function BillingAccounts() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const q = searchParams.get('q') || '', customer = searchParams.get('customer') || '', status = searchParams.get('status') || ''
  const from = searchParams.get('from') || '', to = searchParams.get('to') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const highlight = searchParams.get('new') || ''

  const [data, setData] = useState<ListResponse | null>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState(q)
  const [viewing, setViewing] = useState<SerializedAccount | null>(null)
  const [emailing, setEmailing] = useState<SerializedAccount | null>(null)
  const [linking, setLinking] = useState<SerializedAccount | null>(null)
  const [voiding, setVoiding] = useState<SerializedAccount | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setSearch(q) }, [q])

  const query = searchParams.toString()
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams(query); params.delete('new')
      setData(await api<ListResponse>(`/api/billing?${params.toString()}`))
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [query])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    api<CustomerOption[]>('/api/customers').then(list => setCustomers(list.map(c => ({ ...c, name: c.name || c.email || 'Cliente', city: c.city ?? (c as unknown as { location: string | null }).location ?? null })))).catch(() => { /* Filters still work without the customer list. */ })
  }, [])

  const navigate = (change: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page'); params.delete('new')
    change(params)
    const next = params.toString()
    router.push(`${pathname}${next ? `?${next}` : ''}`)
  }
  const setFilter = (key: string, value: string) => navigate(params => { if (value) params.set(key, value); else params.delete(key) })
  const hasFilters = !!(q || customer || status || from || to)

  const refreshRow = (updated: SerializedAccount) => {
    setData(current => current ? { ...current, accounts: current.accounts.map(a => a.id === updated.id ? updated : a) } : current)
    if (viewing?.id === updated.id) setViewing(updated)
    if (linking?.id === updated.id) setLinking(updated)
  }
  async function sendEmail(account: SerializedAccount) {
    setBusy(true)
    try {
      const { email } = await api<{ email: EmailResult }>(`/api/billing/${account.id}/email`, { method: 'POST' })
      if (email.status === 'sent') toast.success(email.message, { duration: 6000 })
      else if (email.status === 'skipped') toast(email.message, { icon: '⚠️', duration: 8000 })
      else toast.error(email.message, { duration: 8000 })
      setEmailing(null)
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  async function linkAction(account: SerializedAccount, action: 'regenerate' | 'disable' | 'enable') {
    setBusy(true)
    try {
      const result = await api<{ publicEnabled: boolean; publicUrl: string | null }>(`/api/billing/${account.id}/link`, { method: 'POST', json: { action } })
      refreshRow({ ...account, publicEnabled: result.publicEnabled, publicUrl: result.publicUrl })
      toast.success(action === 'regenerate' ? 'Enlace regenerado. El anterior dejó de funcionar.' : action === 'disable' ? 'Enlace público desactivado' : 'Enlace público activado')
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  async function voidAccount(account: SerializedAccount) {
    setBusy(true)
    try {
      const updated = await api<SerializedAccount>(`/api/billing/${account.id}`, { method: 'PATCH', json: { action: 'void', reason: voidReason } })
      refreshRow(updated); setVoiding(null); setVoidReason('')
      toast.success(`Cuenta N.º ${updated.numberLabel} anulada. Su número no se reutiliza.`)
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success('Enlace copiado') } catch { toast.error('No se pudo copiar. Selecciona el enlace y cópialo manualmente.') }
  }

  const totals = data?.totals
  const totalsPending = loading && !data
  const skeleton = <span className="inline-block h-7 w-20 animate-pulse rounded bg-gray-200" aria-label="Cargando" />
  const statusPill = (account: SerializedAccount) => account.status === 'VOID'
    ? <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Anulada</span>
    : <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Emitida</span>
  const actions = (account: SerializedAccount, compact = true) => <div className={`flex flex-wrap items-center gap-1 ${compact ? '' : 'gap-2'}`}>
    <a href={`/api/billing/${account.id}/pdf`} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50" title="Descargar PDF"><Download size={14} /> PDF</a>
    {compact && <button type="button" onClick={() => setViewing(account)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50" title="Ver documento"><Eye size={14} /> Ver</button>}
    <button type="button" disabled={account.status === 'VOID'} onClick={() => setEmailing(account)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50" title={account.status === 'VOID' ? 'Las cuentas anuladas no se envían' : 'Enviar por correo'}><Mail size={14} /> Correo</button>
    <button type="button" onClick={() => setLinking(account)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50" title="Enlace público"><Link2 size={14} /> Enlace</button>
    <button type="button" disabled={account.status === 'VOID'} onClick={() => { setVoidReason(''); setVoiding(account) }} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50" title={account.status === 'VOID' ? 'Ya anulada' : 'Anular cuenta'}><Ban size={14} /> Anular</button>
  </div>

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold text-gray-900">Cuentas de cobro</h1><p className="mt-1 text-gray-600">Cuentas ocasionales y recurrentes con numeración independiente por cliente.</p></div>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/billing/templates" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Repeat size={16} /> Cuentas recurrentes</Link>
        <Link href="/dashboard/billing/new" className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"><Plus size={16} /> Nueva cuenta ocasional</Link>
      </div>
    </div>

    <div className="mb-6 rounded-lg bg-white p-4 shadow">
      <form onSubmit={e => { e.preventDefault(); setFilter('q', search.trim()) }} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input type="text" aria-label="Buscar" placeholder="Buscar por número, cliente, NIT o concepto…" value={search} onChange={e => setSearch(e.target.value)} className={`${inputClass} pl-10`} />
        </div>
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">Buscar</button>
      </form>
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <div className="hidden items-center gap-2 text-gray-700 md:flex"><Filter className="h-5 w-5" /><span className="font-medium">Filtros:</span></div>
        <SearchSelect aria-label="Cliente" className="w-full md:w-64" placeholder="Buscar cliente…" emptyOption="Todos los clientes" value={customer} onChange={id => setFilter('customer', id)}
          options={customers.map(c => ({ id: c.id, label: c.businessName || c.name, description: [c.taxId, c.email].filter(Boolean).join(' · ') || undefined }))} />
        <select aria-label="Estado" value={status} onChange={e => setFilter('status', e.target.value)} className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todos los estados</option><option value="ISSUED">Emitidas</option><option value="VOID">Anuladas</option>
        </select>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <input type="date" aria-label="Desde" value={from} max={to || undefined} onChange={e => setFilter('from', e.target.value)} className={inputClass} />
          <span aria-hidden="true">a</span>
          <input type="date" aria-label="Hasta" value={to} min={from || undefined} onChange={e => setFilter('to', e.target.value)} className={inputClass} />
        </div>
        {hasFilters && <button type="button" onClick={() => { setSearch(''); router.push(pathname) }} className="text-sm font-medium text-primary-600 hover:text-primary-700">Limpiar filtros</button>}
      </div>
    </div>

    {/* Totals over every account matching the current filters, not only this page. */}
    <section aria-label="Totales del filtro actual" className="mb-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Totales del filtro actual</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow"><p className="text-sm font-medium text-gray-600">Cuentas</p><p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{totalsPending ? skeleton : String(totals?.count ?? 0)}</p></div>
        <div className="rounded-lg bg-white p-4 shadow"><p className="text-sm font-medium text-gray-600">Emitidas</p><p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{totalsPending ? skeleton : String(totals?.issuedCount ?? 0)}</p><p className="text-xs text-gray-500 tabular-nums">{totalsPending ? '—' : formatMoney(totals?.issuedCents ?? 0)}</p></div>
        <div className="rounded-lg bg-white p-4 shadow"><p className="text-sm font-medium text-gray-600">Anuladas</p><p className="mt-1 text-2xl font-bold text-gray-500 tabular-nums">{totalsPending ? skeleton : String(totals?.voidCount ?? 0)}</p><p className="text-xs text-gray-400 tabular-nums">{totalsPending ? '—' : formatMoney(totals?.voidCents ?? 0)}</p></div>
        <div className="rounded-lg border-l-4 border-primary-600 bg-white p-4 shadow"><p className="text-sm font-medium text-gray-600">Total emitido</p><p className="mt-1 text-2xl font-bold text-primary-700 tabular-nums">{totalsPending ? skeleton : formatMoney(totals?.issuedCents ?? 0)}</p><p className="text-xs text-gray-500">Sin incluir cuentas anuladas</p></div>
      </div>
    </section>

    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" onClick={() => void load()} className="ml-2 underline">Reintentar</button></p>}
    {loading && !data ? <div className="rounded-lg bg-white p-12 text-center text-gray-500 shadow">Cargando cuentas de cobro…</div>
      : !data || data.accounts.length === 0 ? <div className="rounded-lg bg-white p-12 text-center shadow"><p className="text-lg text-gray-500">No hay cuentas de cobro{hasFilters ? ' con estos filtros' : ''}</p><p className="mt-2 text-gray-400">Genera una cuenta ocasional o configura cuentas recurrentes.</p></div>
      : <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>{['N.º', 'Fecha', 'Cliente', 'Concepto', 'Período', 'Total', 'Estado', 'Acciones'].map(h => <th key={h} scope="col" className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${h === 'Total' ? 'text-right' : ''}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data.accounts.map(account => <tr key={account.id} className={`align-top ${highlight === account.id ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-primary-600 tabular-nums">{account.numberLabel}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{formatShortDateCO(account.issuedAt)}</td>
                <td className="px-4 py-3 text-sm"><div className="font-medium text-gray-900">{account.customer.businessName || account.customer.name}</div>{account.customer.taxId && <div className="text-xs text-gray-500">NIT/CC {account.customer.taxId}</div>}</td>
                <td className="max-w-xs px-4 py-3 text-sm text-gray-700"><span className="line-clamp-2" title={account.concept}>{account.concept}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{account.period ? periodLabel(account.period) : 'Ocasional'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">{formatMoney(account.totalCents)}</td>
                <td className="whitespace-nowrap px-4 py-3">{statusPill(account)}</td>
                <td className="px-4 py-3">{actions(account)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
    {data && <Pagination currentPage={data.page} totalPages={Math.ceil(data.total / data.perPage)} totalCount={data.total} perPage={data.perPage} itemLabel="cuentas" />}

    <Dialog open={!!viewing} onOpenChange={open => { if (!open) setViewing(null) }}>
      <DialogContent className="max-w-4xl">
        {viewing && <>
          <DialogHeader><DialogTitle>Cuenta de cobro N.º {viewing.numberLabel}</DialogTitle><DialogDescription>{viewing.customer.businessName || viewing.customer.name} · {formatDateCO(viewing.issuedAt)} · {formatMoney(viewing.totalCents)} {viewing.status === 'VOID' && '· Anulada'}</DialogDescription></DialogHeader>
          <div className="mb-3">{actions(viewing, false)}</div>
          <PdfPreview src={`/api/billing/${viewing.id}/pdf?disposition=inline`} title={`Cuenta de cobro ${viewing.numberLabel}`} />
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!emailing} onOpenChange={open => { if (!open && !busy) setEmailing(null) }}>
      <DialogContent>
        {emailing && <>
          <DialogHeader><DialogTitle>Enviar cuenta N.º {emailing.numberLabel} por correo</DialogTitle></DialogHeader>
          {emailing.customer.email
            ? <p className="text-sm text-gray-700">Se enviará el PDF a <strong>{emailing.customer.email}</strong> con el enlace público para consultarla.</p>
            : <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">El cliente no tiene correo registrado. Agrega el correo en Clientes antes de enviar.</p>}
          <div className="mt-4 flex gap-2"><Button disabled={busy || !emailing.customer.email} onClick={() => void sendEmail(emailing)}><Mail size={16} />{busy ? 'Enviando…' : 'Enviar'}</Button><Button variant="outline" disabled={busy} onClick={() => setEmailing(null)}>Cancelar</Button></div>
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!linking} onOpenChange={open => { if (!open && !busy) setLinking(null) }}>
      <DialogContent>
        {linking && <>
          <DialogHeader><DialogTitle>Enlace público · cuenta N.º {linking.numberLabel}</DialogTitle><DialogDescription>Permite ver el PDF sin iniciar sesión. Usa un token aleatorio; regenerarlo invalida el anterior.</DialogDescription></DialogHeader>
          {linking.publicEnabled && linking.publicUrl
            ? <div className="flex gap-2"><input readOnly aria-label="Enlace público" value={linking.publicUrl} onFocus={e => e.currentTarget.select()} className={`${inputClass} font-mono text-xs`} /><Button variant="outline" onClick={() => void copy(linking.publicUrl!)}><Copy size={16} /> Copiar</Button></div>
            : <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">El enlace público está desactivado.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void linkAction(linking, 'regenerate')}><RefreshCw size={16} /> Regenerar</Button>
            {linking.publicEnabled
              ? <Button variant="outline" disabled={busy} onClick={() => void linkAction(linking, 'disable')}><Ban size={16} /> Desactivar</Button>
              : <Button disabled={busy} onClick={() => void linkAction(linking, 'enable')}><Link2 size={16} /> Activar</Button>}
          </div>
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!voiding} onOpenChange={open => { if (!open && !busy) setVoiding(null) }}>
      <DialogContent>
        {voiding && <>
          <DialogHeader><DialogTitle>¿Anular la cuenta de cobro N.º {voiding.numberLabel}?</DialogTitle><DialogDescription>El documento se conserva marcado como anulado y su número no vuelve a asignarse.</DialogDescription></DialogHeader>
          <label className="block text-sm font-medium text-gray-700">Motivo (opcional)<Textarea rows={3} maxLength={500} value={voidReason} onChange={e => setVoidReason(e.target.value)} className="mt-1 text-sm" /></label>
          <div className="mt-4 flex gap-2"><Button disabled={busy} className="!bg-red-600 hover:!bg-red-700 focus:!ring-red-500" onClick={() => void voidAccount(voiding)}><Ban size={16} />{busy ? 'Anulando…' : 'Anular cuenta'}</Button><Button variant="outline" disabled={busy} onClick={() => setVoiding(null)}>Cancelar</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>
}
