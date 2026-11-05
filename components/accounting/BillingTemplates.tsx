'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Play, Pencil, Power, History, CheckCircle2, AlertTriangle, XCircle, Download } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { MoneyInput } from './MoneyInput'
import { api, type CustomerOption } from './api'
import type { SerializedTemplate, GenerateResult } from '@/lib/accounting/billing'
import { currentPeriod, periodLabel, formatMoney, formatShortDateCO, toCents } from '@/lib/accounting/format'

type Template = Omit<SerializedTemplate, 'accounts'> & { generated: { id: string; numberLabel: string; issuedAt: string; status: 'ISSUED' | 'VOID' } | null }
type ListResponse = { period: string; templates: Template[] }
type Product = { id: string; name: string; description: string | null; price: number; active: boolean }
type Draft = { id?: string; customerId: string; productId: string; concept: string; totalCents: number | null; active: boolean; accountsCount: number }
const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm'

export default function BillingTemplates() {
  const [period, setPeriod] = useState(currentPeriod)
  const [data, setData] = useState<ListResponse | null>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirming, setConfirming] = useState<string[] | null>(null)
  const [results, setResults] = useState<{ period: string; results: GenerateResult[] } | null>(null)
  const [history, setHistory] = useState<SerializedTemplate | null>(null)
  const [toggling, setToggling] = useState<Template | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await api<ListResponse>(`/api/billing/templates?period=${period}`)); setSelected([]) }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [period])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    api<Array<{ id: string; name: string | null; email: string | null; businessName: string | null; taxId: string | null; phone: string | null; address: string | null; location: string | null }>>('/api/customers')
      .then(list => setCustomers(list.map(c => ({ id: c.id, name: c.name || c.email || 'Cliente', businessName: c.businessName, taxId: c.taxId, email: c.email, phone: c.phone, address: c.address, city: c.location }))))
      .catch(() => { /* The form reports the missing list when opened. */ })
    api<Product[]>('/api/products?active=1').then(setProducts).catch(() => { /* The picker is optional. */ })
  }, [])
  // Choosing a catalog product prefills concept and total; both stay editable.
  function chooseProduct(id: string) {
    setDraft(current => {
      if (!current) return current
      const product = products.find(p => p.id === id)
      if (!product) return { ...current, productId: id }
      return { ...current, productId: id, concept: [product.name, product.description].filter(Boolean).join(' - ').slice(0, 500), totalCents: toCents(product.price) }
    })
  }

  const templates = data?.templates || []
  const pending = templates.filter(t => t.active && !t.generated)
  const selectable = (t: Template) => t.active && !t.generated
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  const future = period > currentPeriod()

  async function generate(ids: string[]) {
    setBusy(true)
    try {
      const response = await api<{ period: string; results: GenerateResult[] }>('/api/billing/templates/generate', { method: 'POST', json: { templateIds: ids, period } })
      setResults(response); setConfirming(null)
      const generated = response.results.filter(r => r.status === 'generated').length
      if (generated) toast.success(`${generated} cuenta${generated === 1 ? '' : 's'} generada${generated === 1 ? '' : 's'}`)
      if (response.results.some(r => r.status !== 'generated')) toast(`${response.results.length - generated} plantilla${response.results.length - generated === 1 ? '' : 's'} no generada${response.results.length - generated === 1 ? '' : 's'}. Revisa el detalle.`, { icon: '⚠️' })
      await load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const draftErrors = draft ? {
    customer: !draft.customerId ? 'Selecciona el cliente.' : '',
    concept: !draft.concept.trim() ? 'Describe el producto o concepto.' : '',
    total: draft.totalCents === null || draft.totalCents < 0 ? 'Indica el total (cero o mayor).' : '',
  } : { customer: '', concept: '', total: '' }
  async function saveDraft(e: React.FormEvent) {
    e.preventDefault(); setAttempted(true)
    if (!draft || Object.values(draftErrors).some(Boolean)) return
    setBusy(true)
    try {
      const payload = { customerId: draft.customerId, concept: draft.concept.trim(), total: (draft.totalCents ?? 0) / 100, active: draft.active, frequency: 'MONTHLY' }
      if (draft.id) await api(`/api/billing/templates/${draft.id}`, { method: 'PATCH', json: payload })
      else await api('/api/billing/templates', { method: 'POST', json: payload })
      toast.success(draft.id ? 'Plantilla actualizada. Aplica a las próximas cuentas.' : 'Plantilla creada')
      setDraft(null); await load()
    } catch (err) { toast.error((err as Error).message) }
    finally { setBusy(false) }
  }
  async function toggleActive(template: Template) {
    setBusy(true)
    try {
      await api(`/api/billing/templates/${template.id}`, { method: 'PATCH', json: { active: !template.active } })
      toast.success(template.active ? 'Plantilla desactivada' : 'Plantilla activada')
      setToggling(null); await load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  async function openHistory(template: Template) {
    try { setHistory(await api<SerializedTemplate>(`/api/billing/templates/${template.id}`)) }
    catch (e) { toast.error((e as Error).message) }
  }
  const customerLabel = (t: Template) => t.customer ? (t.customer.businessName || t.customer.name) : 'Cliente'

  return <>
    <div className="mb-6">
      <Link href="/dashboard/billing" className="mb-3 inline-flex items-center text-gray-600 hover:text-gray-900"><ArrowLeft className="mr-2 h-4 w-4" /> Volver a cuentas de cobro</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold text-gray-900">Cuentas de cobro recurrentes</h1><p className="mt-1 text-gray-600">Configura la cuenta una vez y genera cada período solo las que selecciones.</p></div>
        <Button disabled={busy} onClick={() => { setAttempted(false); setDraft({ customerId: '', productId: '', concept: '', totalCents: null, active: true, accountsCount: 0 }) }}><Plus size={16} /> Nueva plantilla</Button>
      </div>
    </div>

    <div className="mb-4 flex flex-col gap-3 rounded-lg bg-white p-4 shadow md:flex-row md:items-end md:justify-between">
      <label className="text-sm font-medium text-gray-700">Período a generar
        <div className="mt-1 flex items-center gap-3">
          <input type="month" aria-label="Período" value={period} max={currentPeriod()} onChange={e => { if (e.target.value) setPeriod(e.target.value) }} className={`${inputClass} w-auto`} />
          <span className="text-sm text-gray-600">{periodLabel(period)}</span>
        </div>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={busy || !pending.length} onClick={() => setSelected(pending.map(t => t.id))}>Seleccionar todas las pendientes ({pending.length})</Button>
        <Button disabled={busy || !selected.length || future} onClick={() => setConfirming(selected)} title={future ? 'No se generan períodos futuros' : undefined}><Play size={16} /> Generar seleccionadas ({selected.length})</Button>
      </div>
    </div>
    {future && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">El período seleccionado es futuro: puedes consultarlo pero no generar cuentas.</p>}
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" onClick={() => void load()} className="ml-2 underline">Reintentar</button></p>}

    {results && <section className="mb-4 rounded-lg border border-primary-100 bg-white p-4 shadow">
      <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold text-gray-900">Resultado de la generación · {periodLabel(results.period)}</h2><button type="button" onClick={() => setResults(null)} className="text-sm text-gray-500 hover:text-gray-700">Cerrar</button></div>
      <ul className="divide-y divide-gray-100">
        {results.results.map(r => <li key={r.templateId} className="flex items-start gap-3 py-2 text-sm">
          {r.status === 'generated' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : r.status === 'duplicate' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
          <div className="min-w-0 flex-1"><p className="font-medium text-gray-900">{r.customer} <span className="font-normal text-gray-500">· {r.concept}</span></p><p className={r.status === 'generated' ? 'text-green-700' : r.status === 'duplicate' ? 'text-amber-700' : 'text-red-700'}>{r.message}</p></div>
          {r.accountId && <a href={`/api/billing/${r.accountId}/pdf`} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"><Download size={14} /> PDF</a>}
        </li>)}
      </ul>
    </section>}

    {loading && !data ? <div className="rounded-lg bg-white p-12 text-center text-gray-500 shadow">Cargando plantillas…</div>
      : !templates.length ? <div className="rounded-lg bg-white p-12 text-center shadow"><p className="text-lg text-gray-500">No hay plantillas recurrentes</p><p className="mt-2 text-gray-400">Crea una plantilla con cliente, concepto, total y periodicidad.</p></div>
      : <div className="overflow-hidden rounded-lg bg-white shadow"><div className="overflow-x-auto"><table className="w-full">
        <thead className="bg-gray-50"><tr>
          <th scope="col" className="w-10 px-4 py-3"><span className="sr-only">Seleccionar</span></th>
          {['Cliente', 'Concepto', 'Total', 'Periodicidad', `Estado en ${periodLabel(period)}`, 'Acciones'].map(h => <th key={h} scope="col" className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${h === 'Total' ? 'text-right' : ''}`}>{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-gray-200">
          {templates.map(t => {
            const isSelected = selected.includes(t.id)
            return <tr key={t.id} className={`align-top ${!t.active ? 'bg-gray-50 text-gray-400' : isSelected ? 'bg-primary-50' : t.generated ? 'bg-green-50/40' : 'hover:bg-gray-50'}`}>
              <td className="px-4 py-3"><input type="checkbox" aria-label={`Seleccionar ${customerLabel(t)}`} checked={isSelected} disabled={!selectable(t) || busy} onChange={() => toggle(t.id)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-40" /></td>
              <td className="px-4 py-3 text-sm"><div className={`font-medium ${t.active ? 'text-gray-900' : ''}`}>{customerLabel(t)}</div>{t.customer?.taxId && <div className="text-xs text-gray-500">NIT/CC {t.customer.taxId}</div>}</td>
              <td className="max-w-xs px-4 py-3 text-sm"><span className="line-clamp-2" title={t.concept}>{t.concept}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums">{formatMoney(t.totalCents)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">Mensual</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                {!t.active ? <span className="inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">Inactiva</span>
                  : t.generated ? <span className="inline-flex flex-col gap-0.5"><span className="inline-flex w-fit items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800"><CheckCircle2 size={12} /> Generada N.º {t.generated.numberLabel}{t.generated.status === 'VOID' && ' (anulada)'}</span><a href={`/api/billing/${t.generated.id}/pdf`} className="text-xs text-primary-600 hover:underline">el {formatShortDateCO(t.generated.issuedAt)} · PDF</a></span>
                  : <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Pendiente</span>}
              </td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-1">
                <button type="button" disabled={!selectable(t) || busy || future} onClick={() => setConfirming([t.id])} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-40"><Play size={14} /> Generar</button>
                <button type="button" disabled={busy} onClick={() => { setAttempted(false); setDraft({ id: t.id, customerId: t.customerId, productId: '', concept: t.concept, totalCents: t.totalCents, active: t.active, accountsCount: t.accountsCount }) }} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"><Pencil size={14} /> Editar</button>
                <button type="button" disabled={busy} onClick={() => setToggling(t)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"><Power size={14} /> {t.active ? 'Desactivar' : 'Activar'}</button>
                <button type="button" disabled={busy} onClick={() => void openHistory(t)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"><History size={14} /> Historial ({t.accountsCount})</button>
              </div></td>
            </tr>
          })}
        </tbody>
      </table></div></div>}

    <Dialog open={!!draft} onOpenChange={open => { if (!open && !busy) setDraft(null) }}>
      <DialogContent>
        {draft && <form onSubmit={saveDraft} noValidate>
          <DialogHeader><DialogTitle>{draft.id ? 'Editar plantilla recurrente' : 'Nueva plantilla recurrente'}</DialogTitle>{draft.id && <DialogDescription>Los cambios aplican solo a las cuentas que se generen después; las anteriores conservan sus valores.</DialogDescription>}</DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cliente <span className="text-red-500">*</span></label>
              <SearchSelect aria-label="Cliente" placeholder="Buscar cliente…" value={draft.customerId} onChange={id => setDraft({ ...draft, customerId: id })} disabled={busy || draft.accountsCount > 0} invalid={attempted && !!draftErrors.customer}
                options={customers.map(c => ({ id: c.id, label: c.businessName || c.name, description: [c.taxId && `NIT/CC ${c.taxId}`, c.email].filter(Boolean).join(' · ') || undefined }))} />
              {draft.accountsCount > 0 && <p className="mt-1 text-xs text-gray-500">El cliente no cambia en plantillas con cuentas generadas.</p>}
              {attempted && draftErrors.customer && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{draftErrors.customer}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Producto del catálogo (opcional)</label>
              <SearchSelect aria-label="Producto del catálogo" placeholder={products.length ? 'Elegir producto para llenar concepto y total…' : 'Sin productos activos en el catálogo'} emptyOption="Concepto manual" disabled={busy || !products.length} value={draft.productId} onChange={chooseProduct}
                options={products.map(p => ({ id: p.id, label: p.name, description: [p.description, formatMoney(toCents(p.price))].filter(Boolean).join(' · ') }))} />
              <p className="mt-1 text-xs text-gray-500">Llena el concepto y el total con el precio sugerido; puedes editarlos.</p>
            </div>
            <div>
              <label htmlFor="template-concept" className="mb-1 block text-sm font-medium text-gray-700">Producto o concepto <span className="text-red-500">*</span></label>
              <textarea id="template-concept" rows={3} maxLength={500} value={draft.concept} onChange={e => setDraft({ ...draft, concept: e.target.value })} className={inputClass} aria-invalid={attempted && !!draftErrors.concept} />
              {attempted && draftErrors.concept && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{draftErrors.concept}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="template-total" className="mb-1 block text-sm font-medium text-gray-700">Total (COP) <span className="text-red-500">*</span></label>
                <MoneyInput id="template-total" valueCents={draft.totalCents} onChange={cents => setDraft({ ...draft, totalCents: cents })} disabled={busy} placeholder="250.000" invalid={attempted && !!draftErrors.total} />
                <p className="mt-1 text-xs text-gray-500">{draft.totalCents !== null ? formatMoney(draft.totalCents) : ' '}</p>
                {attempted && draftErrors.total && <p role="alert" className="text-xs font-medium text-red-700">{draftErrors.total}</p>}
              </div>
              <div>
                <label htmlFor="template-frequency" className="mb-1 block text-sm font-medium text-gray-700">Periodicidad</label>
                <select id="template-frequency" value="MONTHLY" onChange={() => undefined} className={inputClass}><option value="MONTHLY">Mensual</option></select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" /> Plantilla activa (disponible para generar)</label>
          </div>
          <div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Crear plantilla'}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!confirming} onOpenChange={open => { if (!open && !busy) setConfirming(null) }}>
      <DialogContent>
        {confirming && <>
          <DialogHeader><DialogTitle>Generar {confirming.length === 1 ? 'la cuenta' : `${confirming.length} cuentas`} de {periodLabel(period)}</DialogTitle><DialogDescription>Cada cuenta recibe el siguiente número de su cliente, su PDF y su enlace público. Si alguna ya existe para este período, se informa y no se duplica.</DialogDescription></DialogHeader>
          <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 text-sm">
            {confirming.map(id => { const t = templates.find(x => x.id === id); return t ? <li key={id} className="flex justify-between gap-3 px-3 py-2"><span><span className="font-medium text-gray-900">{customerLabel(t)}</span> <span className="text-gray-500">· {t.concept}</span></span><span className="whitespace-nowrap font-semibold tabular-nums">{formatMoney(t.totalCents)}</span></li> : null })}
          </ul>
          <div className="mt-4 flex gap-2"><Button disabled={busy} onClick={() => void generate(confirming)}><Play size={16} />{busy ? 'Generando…' : 'Generar'}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>Cancelar</Button></div>
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!toggling} onOpenChange={open => { if (!open && !busy) setToggling(null) }}>
      <DialogContent>
        {toggling && <>
          <DialogHeader><DialogTitle>{toggling.active ? '¿Desactivar la plantilla?' : '¿Activar la plantilla?'}</DialogTitle><DialogDescription>{customerLabel(toggling)} · {toggling.concept}. {toggling.active ? 'No se podrán generar nuevas cuentas hasta reactivarla; el historial se conserva.' : 'Volverá a estar disponible para generar cuentas.'}</DialogDescription></DialogHeader>
          <div className="flex gap-2"><Button disabled={busy} onClick={() => void toggleActive(toggling)}><Power size={16} /> {toggling.active ? 'Desactivar' : 'Activar'}</Button><Button variant="outline" disabled={busy} onClick={() => setToggling(null)}>Cancelar</Button></div>
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!history} onOpenChange={open => { if (!open) setHistory(null) }}>
      <DialogContent>
        {history && <>
          <DialogHeader><DialogTitle>Historial de cuentas generadas</DialogTitle><DialogDescription>{history.customer ? (history.customer.businessName || history.customer.name) : 'Cliente'} · {history.concept}</DialogDescription></DialogHeader>
          {!history.accounts?.length ? <p className="text-sm text-gray-500">Esta plantilla aún no ha generado cuentas.</p>
            : <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200"><table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-2">N.º</th><th className="px-3 py-2">Período</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2"></th></tr></thead>
              <tbody className="divide-y divide-gray-100">{history.accounts.map(a => <tr key={a.id}><td className="px-3 py-2 font-semibold text-primary-600 tabular-nums">{a.numberLabel}</td><td className="px-3 py-2">{a.period ? periodLabel(a.period) : '—'}</td><td className="px-3 py-2">{formatShortDateCO(a.issuedAt)}</td><td className="px-3 py-2">{a.status === 'VOID' ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Anulada</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Emitida</span>}</td><td className="px-3 py-2"><a href={`/api/billing/${a.id}/pdf`} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"><Download size={14} /> PDF</a></td></tr>)}</tbody>
            </table></div>}
        </>}
      </DialogContent>
    </Dialog>
  </>
}
