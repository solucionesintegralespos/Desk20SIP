'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Mail, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from './api'
import { PdfPreview } from './PdfPreview'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui'
import { formatMoney, formatNumber, formatDateTimeCO } from '@/lib/accounting/format'
import type { SerializedQuote } from '@/lib/accounting/quotes'

type EmailResult = { status: 'sent' | 'skipped' | 'failed'; recipient: string | null; message: string }

export default function QuoteDetail({ id }: { id: string }) {
  const [quote, setQuote] = useState<SerializedQuote | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    api<SerializedQuote>(`/api/quotes/${encodeURIComponent(id)}`).then(data => { if (!cancelled) setQuote(data) }).catch(e => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [id])

  async function send() {
    if (!quote || sending) return
    setSending(true)
    try {
      const { email } = await api<{ email: EmailResult }>(`/api/quotes/${encodeURIComponent(id)}/email`, { method: 'POST' })
      setConfirming(false)
      if (email.status === 'sent') toast.success(email.message, { duration: 6000 })
      else if (email.status === 'skipped') toast(email.message, { icon: '⚠️', duration: 8000 })
      else toast.error(email.message, { duration: 8000 })
    } catch (e) { toast.error((e as Error).message) }
    finally { setSending(false) }
  }

  if (error) return <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error} <Link href="/dashboard/quotes" className="underline">Volver a cotizaciones</Link></p>
  if (!quote) return <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">Cargando cotización…</div>

  const customer = quote.customer
  const canEmail = !!customer.email

  return <>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <Link href="/dashboard/quotes" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"><ArrowLeft className="h-4 w-4 mr-1" /> Volver a cotizaciones</Link>
        <h1 className="text-3xl font-bold text-gray-900">{quote.title} {quote.numberLabel}</h1>
        <p className="text-gray-600 mt-1">Creada el {formatDateTimeCO(quote.createdAt)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/quotes/${encodeURIComponent(id)}/pdf`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"><Download className="h-4 w-4" /> Descargar PDF</a>
        <button type="button" onClick={() => setConfirming(true)} disabled={!canEmail || sending} title={canEmail ? `Enviar a ${customer.email}` : 'El cliente no tiene correo registrado'}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
          <Mail className="h-4 w-4" /> Enviar por correo
        </button>
      </div>
    </div>
    {!canEmail && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">El cliente no tiene correo registrado. Agrégalo en <Link href={`/dashboard/customers/${customer.id}`} className="underline">Clientes</Link> para poder enviar la cotización.</p>}

    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-5">
        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Cliente</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div><dt className="text-gray-500">Nombre</dt><dd className="font-medium text-gray-900">{customer.name}</dd></div>
            <div><dt className="text-gray-500">Razón social</dt><dd className="font-medium text-gray-900">{quote.snapshotCustomer.businessName || 'No registrada'}</dd></div>
            <div><dt className="text-gray-500">NIT / C.C.</dt><dd className="font-medium text-gray-900">{quote.snapshotCustomer.taxId || 'No registrado'}</dd></div>
            <div><dt className="text-gray-500">Correo</dt><dd className="font-medium text-gray-900">{customer.email || 'Sin correo'}</dd></div>
            <div><dt className="text-gray-500">Teléfono</dt><dd className="font-medium text-gray-900">{quote.snapshotCustomer.phone || '—'}</dd></div>
            <div><dt className="text-gray-500">Dirección</dt><dd className="font-medium text-gray-900">{[quote.snapshotCustomer.address, quote.snapshotCustomer.city].filter(Boolean).join(', ') || '—'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-gray-500">Los datos corresponden al momento en que se emitió la cotización.</p>
        </section>

        <section className="bg-white rounded-lg shadow overflow-hidden">
          <h2 className="font-semibold text-gray-900 p-5 pb-3">Detalle</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr><th className="px-4 py-2 text-left">Ítem</th><th className="px-4 py-2 text-left">Descripción</th><th className="px-4 py-2 text-right">Cant.</th><th className="px-4 py-2 text-right">Valor unit.</th><th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {quote.items.map(item => <tr key={item.id}>
                  <td className="px-4 py-2 text-gray-500">{String(item.position).padStart(2, '0')}</td>
                  <td className="px-4 py-2"><div className="font-medium text-gray-900">{item.name}</div>{item.description && <div className="text-xs text-gray-500">{item.description}</div>}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(item.quantity)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(item.unitPriceCents)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(item.totalCents)}</td>
                </tr>)}
              </tbody>
              <tfoot className="bg-gray-50 text-sm">
                <tr><td colSpan={4} className="px-4 py-2 text-right text-gray-600">Subtotal</td><td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(quote.subtotalCents)}</td></tr>
                <tr><td colSpan={4} className="px-4 py-2 text-right text-gray-600">{quote.taxName ? `${quote.taxName} (${formatNumber(quote.taxRate || 0)} %)` : 'Sin impuesto'}</td><td className="px-4 py-2 text-right font-medium tabular-nums">{quote.taxName ? formatMoney(quote.taxCents) : '—'}</td></tr>
                <tr className="text-base"><td colSpan={4} className="px-4 py-2 text-right font-semibold text-gray-900">Total</td><td className="px-4 py-2 text-right font-bold text-gray-900 tabular-nums">{formatMoney(quote.totalCents)}</td></tr>
              </tfoot>
            </table>
          </div>
        </section>

        {(quote.notes || quote.conditions) && <section className="bg-white rounded-lg shadow p-5 space-y-3 text-sm">
          {quote.notes && <div><h3 className="font-semibold text-gray-900 mb-1">Observaciones</h3><p className="whitespace-pre-line text-gray-700">{quote.notes}</p></div>}
          {quote.conditions && <div><h3 className="font-semibold text-gray-900 mb-1">Formas de pago y consideraciones</h3><p className="whitespace-pre-line text-gray-700">{quote.conditions}</p></div>}
        </section>}
      </div>

      <div className="xl:sticky xl:top-4 self-start">
        <PdfPreview src={`/api/quotes/${encodeURIComponent(id)}/pdf?disposition=inline`} title="Documento de la cotización" />
      </div>
    </div>

    <Dialog open={confirming} onOpenChange={open => { if (!sending) setConfirming(open) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar cotización por correo</DialogTitle>
          <DialogDescription>Se enviará la cotización {quote.numberLabel} con el PDF adjunto a <strong>{customer.email}</strong>.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" disabled={sending} onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button disabled={sending} onClick={() => void send()}>{sending ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : <><Mail size={16} /> Enviar ahora</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
