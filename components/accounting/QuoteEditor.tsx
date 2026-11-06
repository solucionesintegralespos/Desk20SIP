'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, type CompanyBranding, type CustomerOption } from './api'
import { PdfPreview } from './PdfPreview'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { SearchFilter, type SearchValue } from '@/components/support/SearchFilter'
import { MoneyInput } from './MoneyInput'
import { quotePdf, type QuoteDocument } from '@/lib/accounting/quote-pdf'
import { formatMoney, formatNumber, quoteTotals, toCents } from '@/lib/accounting/format'
import { clientId } from '@/lib/support/client-id'
import type { SerializedQuote } from '@/lib/accounting/quotes'

type Customer = Pick<CustomerOption, 'id' | 'name' | 'businessName' | 'taxId' | 'email' | 'phone' | 'address'> & { location?: string | null }
type Product = { id: string; name: string; description: string | null; price: number; active: boolean }
type Tax = { id: string; name: string; rate: number; active: boolean; isDefault: boolean }
type Line = { key: string; productId: string | null; name: string; description: string; quantity: string; unitPriceCents: number | null }

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const newLine = (): Line => ({ key: clientId(), productId: null, name: '', description: '', quantity: '1', unitPriceCents: 0 })

/**
 * Creates a quote, edits an existing one when `quoteId` is given (same number, new content),
 * or starts a new draft prefilled from another quote when `duplicateFrom` is given.
 */
export default function QuoteEditor({ quoteId, duplicateFrom }: { quoteId?: string; duplicateFrom?: string } = {}) {
  const router = useRouter()
  const editing = !!quoteId
  const sourceId = quoteId || duplicateFrom
  const [sourceLabel, setSourceLabel] = useState('')
  const [existing, setExisting] = useState<SerializedQuote | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [taxes, setTaxes] = useState<Tax[]>([])
  const [branding, setBranding] = useState<CompanyBranding | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // `id` set: registered customer; otherwise `query` is the free-text name of an unregistered one.
  const [customerPick, setCustomerPick] = useState<SearchValue>({ query: '', id: '' })
  const [taxId, setTaxId] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [notes, setNotes] = useState('')
  const [conditions, setConditions] = useState('')
  const [freeEmail, setFreeEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api<Customer[]>('/api/customers'),
      api<Product[]>('/api/products?active=1'),
      api<Tax[]>('/api/taxes?active=1'),
      api<CompanyBranding>('/api/documents/branding'),
      sourceId ? api<SerializedQuote>(`/api/quotes/${encodeURIComponent(sourceId)}`) : Promise.resolve(null),
    ]).then(([customerList, productList, taxList, brand, quote]) => {
      if (cancelled) return
      setCustomers(customerList); setProducts(productList.filter(p => p.active)); setTaxes(taxList.filter(t => t.active)); setBranding(brand)
      if (quote) {
        // Edit or duplicate: prefill everything from the stored quote (lines keep their product link and edited prices).
        if (quoteId) setExisting(quote); else setSourceLabel(quote.numberLabel)
        const registered = quote.registered && quote.customerId && customerList.some(c => c.id === quote.customerId)
        const option = registered ? customerList.find(c => c.id === quote.customerId) : null
        setCustomerPick(option ? { id: option.id, query: option.businessName || option.name || option.email || 'Cliente' } : { id: '', query: quote.customer.name })
        if (!registered) setFreeEmail(quote.customer.email || '')
        setTaxId(quote.taxId && taxList.some(t => t.id === quote.taxId && t.active) ? quote.taxId : '')
        setLines(quote.items.map(item => ({ key: clientId(), productId: item.productId, name: item.name, description: item.description || '', quantity: String(item.quantity), unitPriceCents: item.unitPriceCents })))
        setNotes(quote.notes || ''); setConditions(quote.conditions || '')
        return
      }
      setConditions(brand.company.quoteConditions || '')
      // IVA 19 % is preselected; it can be removed or replaced from the select.
      const preset = taxList.find(t => t.active && t.isDefault) || taxList.find(t => t.active && /iva/i.test(t.name) && Math.round(t.rate) === 19)
      setTaxId(preset?.id || '')
    }).catch(e => { if (!cancelled) setLoadError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quoteId, sourceId])

  const customerId = customerPick.id
  const customer = customers.find(c => c.id === customerId) || null
  const freeCustomerName = !customerId ? customerPick.query.trim() : ''
  const tax = taxes.find(t => t.id === taxId) || null
  const customerOptions = useMemo(() => customers.map(c => ({ id: c.id, label: c.businessName || c.name || c.email || 'Sin nombre', description: [c.businessName && c.businessName !== c.name ? c.name : '', c.taxId ? `NIT/CC ${c.taxId}` : '', c.email].filter(Boolean).join(' · ') || undefined })), [customers])
  const productOptions = useMemo(() => products.map(p => ({ id: p.id, label: p.name, description: `${formatMoney(toCents(p.price))}${p.description ? ` · ${p.description}` : ''}` })), [products])

  const parsedLines = lines.map(line => ({ ...line, qty: Number(line.quantity.replace(',', '.')), unitPriceCents: line.unitPriceCents ?? 0 }))
  const totals = quoteTotals(parsedLines.map(l => ({ quantity: Number.isFinite(l.qty) && l.qty > 0 ? l.qty : 0, unitPriceCents: l.unitPriceCents })), tax ? tax.rate : null)

  const updateLine = (key: string, patch: Partial<Line>) => setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line))
  const chooseProduct = (key: string, productId: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) { updateLine(key, { productId: null }); return }
    // The suggested price is loaded once; editing it here never changes the catalog.
    updateLine(key, { productId: product.id, name: product.name, description: product.description || '', unitPriceCents: toCents(product.price) })
  }

  const errors = {
    customer: !customerId && !freeCustomerName ? 'Selecciona un cliente o escribe su nombre.' : '',
    lines: !lines.length ? 'Agrega al menos un producto.' : parsedLines.some(l => !l.name.trim()) ? 'Cada ítem necesita una descripción.' : parsedLines.some(l => !Number.isFinite(l.qty) || l.qty <= 0) ? 'Las cantidades deben ser mayores que cero.' : parsedLines.some(l => l.unitPriceCents < 0) ? 'Los precios no pueden ser negativos.' : '',
  }
  const valid = !errors.customer && !errors.lines

  // The preview renders the same document the server will generate after saving.
  const document: QuoteDocument | null = branding ? {
    company: branding.company, logo: branding.logo || undefined, number: existing?.numberLabel || 'Borrador', date: existing?.createdAt || new Date().toISOString(),
    customer: customer ? { name: customer.name || customer.email || 'Cliente', businessName: customer.businessName, taxId: customer.taxId, email: customer.email, phone: customer.phone, address: customer.address, city: customer.location } : { name: freeCustomerName || 'Cliente', email: freeEmail.trim() || null },
    items: parsedLines.map((l, index) => ({ name: l.name.trim() || 'Ítem sin descripción', description: l.description.trim() || null, quantity: Number.isFinite(l.qty) && l.qty > 0 ? l.qty : 0, unitPriceCents: l.unitPriceCents, totalCents: totals.lines[index] })),
    subtotalCents: totals.subtotalCents, taxName: tax?.name || null, taxRatePercent: tax ? tax.rate : null, taxCents: totals.taxCents, totalCents: totals.totalCents,
    title: 'Cotización', notes, conditions, signer: existing?.issuer || branding.issuer,
  } : null
  const previewKey = JSON.stringify({ customerId, freeCustomerName, freeEmail, taxId, lines, notes, conditions, logo: !!branding?.logo, signer: branding?.issuer })
  const freeEmailInvalid = !!freeCustomerName && !!freeEmail.trim() && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(freeEmail.trim())
  const issuer = branding?.issuer || null
  const signerMissing = issuer ? [!issuer.jobTitle && 'cargo', !issuer.phone && 'teléfono', !issuer.email && 'correo'].filter(Boolean) : []

  async function save() {
    setAttempted(true)
    if (!valid || saving) { if (!valid) toast.error(errors.customer || errors.lines); return }
    if (freeEmailInvalid) { toast.error('Ingresa un correo válido para el cliente'); return }
    setSaving(true)
    try {
      const payload = {
        customerId: customerId || null, customerName: freeCustomerName, customerEmail: customerId ? '' : freeEmail.trim(), taxId: taxId || null, notes, conditions, title: 'Cotización',
        items: parsedLines.map(l => ({ productId: l.productId, name: l.name.trim(), description: l.description.trim(), quantity: l.qty, unitPrice: l.unitPriceCents / 100 })),
      }
      const saved = editing
        ? await api<{ id: string; numberLabel: string }>(`/api/quotes/${encodeURIComponent(quoteId!)}`, { method: 'PUT', json: payload })
        : await api<{ id: string; numberLabel: string }>('/api/quotes', { method: 'POST', json: payload })
      toast.success(editing ? `Cotización ${saved.numberLabel} actualizada` : `Cotización ${saved.numberLabel} guardada`)
      router.push(`/dashboard/quotes/${saved.id}`)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
      setSaving(false)
    }
  }

  if (loadError) return <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{loadError}</p>

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <Link href="/dashboard/quotes" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"><ArrowLeft className="h-4 w-4 mr-1" /> Volver a cotizaciones</Link>
        <h1 className="text-3xl font-bold text-gray-900">{editing ? `Editar cotización ${existing?.numberLabel || ''}` : 'Nueva cotización'}</h1>
        <p className="text-gray-600 mt-1">{editing ? 'Los cambios reemplazan el contenido de la cotización; conserva su número y fecha' : sourceLabel ? `Borrador creado a partir de ${sourceLabel}: ajusta cliente, productos o precios y guarda para emitir una cotización nueva` : 'El documento se previsualiza a medida que lo construyes'}</p>
      </div>
      <div className="flex gap-2">
        <Link href={editing ? `/dashboard/quotes/${quoteId}` : '/dashboard/quotes'} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancelar</Link>
        <button type="button" onClick={() => void save()} disabled={saving || loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar cotización'}
        </button>
      </div>
    </div>

    {loading ? <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">Cargando clientes, productos e impuestos…</div> : <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-5">
        <section className="bg-white rounded-lg shadow p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Cliente</h2>
          <div>
            <SearchFilter label="Cliente (busca uno registrado o escribe el nombre)" placeholder="Nombre, razón social o NIT…" options={customerOptions} value={customerPick} onChange={setCustomerPick} />
            {attempted && errors.customer && <p role="alert" className="mt-1 text-xs text-red-700">{errors.customer}</p>}
            {freeCustomerName && <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-600">Este cliente no está en el directorio: la cotización se emitirá a nombre de «{freeCustomerName}».</p>
              <label htmlFor="quote-free-email" className="mt-2 block text-sm font-medium text-gray-700">Correo del cliente (opcional, para enviarle la cotización)</label>
              <input id="quote-free-email" type="email" inputMode="email" autoComplete="off" value={freeEmail} onChange={e => setFreeEmail(e.target.value)} placeholder="cliente@ejemplo.com" aria-invalid={freeEmailInvalid || undefined} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${freeEmailInvalid ? 'border-red-400' : 'border-gray-300'}`} />
              {freeEmailInvalid && <p role="alert" className="mt-1 text-xs text-red-700">Ingresa un correo válido.</p>}
            </div>}
          </div>
          {customer && <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div><dt className="text-gray-500">Nombre</dt><dd className="font-medium text-gray-900">{customer.name || '—'}</dd></div>
            <div><dt className="text-gray-500">Razón social</dt><dd className="font-medium text-gray-900">{customer.businessName || '—'}</dd></div>
            <div><dt className="text-gray-500">NIT / C.C.</dt><dd className="font-medium text-gray-900">{customer.taxId || '—'}</dd></div>
            <div><dt className="text-gray-500">Correo</dt><dd className="font-medium text-gray-900">{customer.email || 'Sin correo'}</dd></div>
            <div><dt className="text-gray-500">Teléfono</dt><dd className="font-medium text-gray-900">{customer.phone || '—'}</dd></div>
            <div><dt className="text-gray-500">Dirección</dt><dd className="font-medium text-gray-900">{[customer.address, customer.location].filter(Boolean).join(', ') || '—'}</dd></div>
          </dl>}
        </section>

        <section className="bg-white rounded-lg shadow p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-900">Productos</h2>
            <button type="button" onClick={() => setLines(current => [...current, newLine()])} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"><Plus className="h-4 w-4" /> Agregar ítem manual</button>
          </div>
          {attempted && errors.lines && <p role="alert" className="text-xs text-red-700">{errors.lines}</p>}
          <div className="space-y-3">
            {parsedLines.map((line, index) => <div key={line.key} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 text-xs font-semibold text-gray-500">{String(index + 1).padStart(2, '0')}</span>
                <div className="flex-1 min-w-0 space-y-2">
                  <SearchSelect aria-label={`Producto del ítem ${index + 1}`} placeholder="Elegir producto del catálogo (opcional)…" emptyOption="Ítem manual" value={line.productId || ''} onChange={id => chooseProduct(line.key, id)} options={productOptions} />
                  <input type="text" aria-label={`Descripción del ítem ${index + 1}`} placeholder="Descripción del producto o servicio" value={line.name} onChange={e => updateLine(line.key, { name: e.target.value })} maxLength={250} className={inputClass} />
                  <input type="text" aria-label={`Detalle del ítem ${index + 1}`} placeholder="Detalle adicional (opcional)" value={line.description} onChange={e => updateLine(line.key, { description: e.target.value })} maxLength={1000} className={inputClass} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label className="text-xs text-gray-600">Cantidad
                      <input type="number" inputMode="decimal" min="0.01" step="0.01" value={line.quantity} onChange={e => updateLine(line.key, { quantity: e.target.value })} className={`${inputClass} mt-1 text-right tabular-nums`} />
                    </label>
                    <label className="text-xs text-gray-600">Valor unitario
                      <MoneyInput aria-label={`Valor unitario del ítem ${index + 1}`} valueCents={line.unitPriceCents} onChange={cents => updateLine(line.key, { unitPriceCents: cents })} className="mt-1 text-sm" placeholder="0" />
                    </label>
                    <div className="text-xs text-gray-600 col-span-2 sm:col-span-1">Valor total
                      <p className="mt-1 px-3 py-2 rounded-lg bg-gray-50 text-right text-sm font-semibold text-gray-900 tabular-nums">{formatMoney(totals.lines[index])}</p>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => setLines(current => current.filter(l => l.key !== line.key))} aria-label={`Quitar ítem ${index + 1}`} title="Quitar ítem" className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>)}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Impuesto y totales</h2>
          <label className="block text-sm font-medium text-gray-700">Impuesto aplicado a toda la cotización
            <select value={taxId} onChange={e => setTaxId(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">Sin impuesto</option>
              {taxes.map(t => <option key={t.id} value={t.id}>{t.name} ({formatNumber(t.rate)} %)</option>)}
            </select>
          </label>
          <dl className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd className="font-medium tabular-nums">{formatMoney(totals.subtotalCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">{tax ? `${tax.name} (${formatNumber(tax.rate)} %)` : 'Impuesto'}</dt><dd className="font-medium tabular-nums">{tax ? formatMoney(totals.taxCents) : '—'}</dd></div>
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base"><dt className="font-semibold text-gray-900">Total</dt><dd className="font-bold text-gray-900 tabular-nums">{formatMoney(totals.totalCents)}</dd></div>
          </dl>
        </section>

        <section className="bg-white rounded-lg shadow p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Textos del documento</h2>
          <label className="block text-sm font-medium text-gray-700">Observaciones
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Notas para el cliente (opcional)" className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Formas de pago y consideraciones
            <textarea value={conditions} onChange={e => setConditions(e.target.value)} rows={5} maxLength={4000} className={`${inputClass} mt-1`} />
          </label>
          <p className="text-xs text-gray-500">
            Firma: {issuer ? [issuer.name, issuer.jobTitle, issuer.email, issuer.phone].filter(Boolean).join(' · ') : 'Sin datos del usuario'}. Se toma de tu perfil.
            {signerMissing.length > 0 && <> Agrega tu {signerMissing.join(', ')} en <Link href="/dashboard/profile" className="text-primary-600 hover:underline">Mi perfil</Link>.</>}
          </p>
        </section>
      </div>

      <div className="xl:sticky xl:top-4 self-start">
        {document ? <PdfPreview build={() => quotePdf(document)} deps={[previewKey]} title="Vista previa de la cotización" /> : <div className="rounded-xl border border-gray-200 bg-gray-100 p-6 text-sm text-gray-500">No se pudo cargar la identidad de la empresa para la vista previa.</div>}
      </div>
    </div>}
  </>
}
