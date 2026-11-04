'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Receipt } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { PdfPreview } from './PdfPreview'
import { api, type CompanyBranding, type CustomerOption } from './api'
import { billingPdf, type BillingDocument } from '@/lib/accounting/billing-pdf'
import { amountInWords } from '@/lib/accounting/number-words'
import { formatMoney, toCents } from '@/lib/accounting/format'
import type { SerializedAccount } from '@/lib/accounting/billing'

type RawCustomer = { id: string; name: string | null; email: string | null; phone: string | null; location: string | null; address: string | null; businessName: string | null; taxId: string | null }
type NextNumber = { next: number; numberLabel: string; started: boolean }
const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500'

export default function NewBillingAccount() {
  const router = useRouter()
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [branding, setBranding] = useState<CompanyBranding | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [concept, setConcept] = useState('')
  const [total, setTotal] = useState('')
  const [next, setNext] = useState<NextNumber | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    Promise.all([api<RawCustomer[]>('/api/customers'), api<CompanyBranding>('/api/documents/branding')])
      .then(([list, brand]) => {
        setCustomers(list.map(c => ({ id: c.id, name: c.name || c.email || 'Cliente', businessName: c.businessName, taxId: c.taxId, email: c.email, phone: c.phone, address: c.address, city: c.location })))
        setBranding(brand)
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!customerId) { setNext(null); return }
    let cancelled = false
    api<NextNumber>(`/api/billing/next?customerId=${encodeURIComponent(customerId)}`).then(result => { if (!cancelled) setNext(result) }).catch(() => { if (!cancelled) setNext(null) })
    return () => { cancelled = true }
  }, [customerId])

  const customer = customers.find(c => c.id === customerId) || null
  const totalCents = toCents(total)
  const validTotal = total.trim() !== '' && Number.isFinite(Number(total)) && Number(total) >= 0
  const errors = {
    customer: !customerId ? 'Selecciona el cliente.' : '',
    concept: !concept.trim() ? 'Describe el producto o concepto.' : concept.length > 500 ? 'Máximo 500 caracteres.' : '',
    total: !validTotal ? 'Indica el total (cero o mayor).' : '',
  }
  const invalid = Object.values(errors).some(Boolean)

  const document = useMemo((): BillingDocument | null => {
    if (!branding) return null
    const issuedAt = new Date()
    const dueDays = branding.company.billingDueDays
    return {
      company: { name: branding.company.name, nit: branding.company.nit, phone: branding.company.phone, email: branding.company.email, website: branding.company.website, address: branding.company.address, city: branding.company.city, paymentInfo: branding.company.paymentInfo, legalNote: branding.company.legalNote },
      logo: branding.logo || undefined, number: next?.numberLabel || '—', issuedAt: issuedAt.toISOString(),
      dueAt: dueDays > 0 ? new Date(issuedAt.getTime() + dueDays * 86400000).toISOString() : null,
      customer: customer ? { name: customer.name, businessName: customer.businessName, taxId: customer.taxId, email: customer.email, phone: customer.phone, address: customer.address, city: customer.city } : { name: 'Cliente por seleccionar' },
      concept: concept.trim() || 'Producto o concepto por definir', totalCents, amountInWords: amountInWords(totalCents), period: null, status: 'ISSUED',
    }
    // The issue date changes every minute at most; the preview only needs the day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding, next?.numberLabel, customer, concept, totalCents])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    if (invalid || submitting) return
    setSubmitting(true)
    try {
      const account = await api<SerializedAccount>('/api/billing', { method: 'POST', json: { customerId, concept: concept.trim(), total: Number(total) } })
      toast.success(`Cuenta N.º ${account.numberLabel} generada`, { duration: 6000 })
      router.push(`/dashboard/billing?new=${account.id}`)
      router.refresh()
    } catch (err) { toast.error((err as Error).message); setSubmitting(false) }
  }

  return <>
    <div className="mb-6">
      <Link href="/dashboard/billing" className="mb-3 inline-flex items-center text-gray-600 hover:text-gray-900"><ArrowLeft className="mr-2 h-4 w-4" /> Volver a cuentas de cobro</Link>
      <h1 className="text-3xl font-bold text-gray-900">Nueva cuenta de cobro</h1>
      <p className="mt-1 text-gray-600">Solo cliente, concepto y total. El número, los datos del cliente y de la empresa se toman automáticamente.</p>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form onSubmit={submit} noValidate className="h-fit rounded-lg bg-white p-6 shadow space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Cliente <span className="text-red-500">*</span></label>
          <SearchSelect aria-label="Cliente" placeholder={loading ? 'Cargando clientes…' : 'Buscar cliente…'} disabled={loading || submitting} value={customerId} onChange={setCustomerId} invalid={attempted && !!errors.customer}
            options={customers.map(c => ({ id: c.id, label: c.businessName || c.name, description: [c.taxId && `NIT/CC ${c.taxId}`, c.email].filter(Boolean).join(' · ') || undefined }))} />
          {attempted && errors.customer && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{errors.customer}</p>}
          {customer && <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <dt className="font-medium">Razón social</dt><dd>{customer.businessName || <span className="text-gray-400">No registrada</span>}</dd>
            <dt className="font-medium">NIT / C.C.</dt><dd>{customer.taxId || <span className="text-gray-400">No registrado</span>}</dd>
            <dt className="font-medium">Correo</dt><dd>{customer.email || <span className="text-gray-400">No registrado</span>}</dd>
            <dt className="font-medium">Número</dt><dd className="font-semibold text-primary-700">{next ? `Se asignará el número ${next.numberLabel}` : 'Consultando…'}</dd>
          </dl>}
        </div>
        <div>
          <label htmlFor="billing-concept" className="mb-2 block text-sm font-medium text-gray-700">Producto o concepto <span className="text-red-500">*</span></label>
          <textarea id="billing-concept" rows={3} maxLength={500} value={concept} disabled={submitting} onChange={e => setConcept(e.target.value)} placeholder="Ej.: adaptador y cable de red" className={inputClass} aria-invalid={attempted && !!errors.concept} />
          <div className="mt-1 flex justify-between text-xs"><span className="text-red-700" role={attempted && errors.concept ? 'alert' : undefined}>{attempted && errors.concept}</span><span className="text-gray-400">{concept.length}/500</span></div>
        </div>
        <div>
          <label htmlFor="billing-total" className="mb-2 block text-sm font-medium text-gray-700">Total (COP) <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-3">
            <input id="billing-total" type="number" inputMode="decimal" min={0} step={1} value={total} disabled={submitting} onChange={e => setTotal(e.target.value)} placeholder="176000" className={inputClass} aria-invalid={attempted && !!errors.total} />
            <span className="whitespace-nowrap text-sm font-semibold text-gray-900 tabular-nums">{validTotal ? formatMoney(totalCents) : '—'}</span>
          </div>
          {attempted && errors.total && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{errors.total}</p>}
          {validTotal && <p className="mt-1 text-xs text-gray-500">{amountInWords(totalCents)}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t pt-4">
          <Link href="/dashboard/billing" className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50">Cancelar</Link>
          <button type="submit" disabled={submitting || loading} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2 text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"><Receipt size={16} />{submitting ? 'Generando…' : 'Generar cuenta de cobro'}</button>
        </div>
      </form>
      <div>
        {document ? <PdfPreview build={() => billingPdf(document)} deps={[document.number, document.customer, document.concept, document.totalCents, document.company.name]} title="Vista previa de la cuenta de cobro" />
          : <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-sm text-gray-500">{loading ? 'Cargando datos de la empresa…' : 'No se pudo cargar la vista previa'}</div>}
      </div>
    </div>
  </>
}
