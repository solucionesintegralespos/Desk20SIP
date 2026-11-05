import { pdfText, bogotaDate, bogotaDateTime } from '@/lib/order-pdf'
import { formatMoney, periodLabel } from './format'
import { MARGIN, loadPdf, pdfBytes, type PdfLogo } from './pdf-brand'

// Cuenta de cobro: minimalist black-and-white layout that follows the reference document
// (issuer and phone, number, city and date, due date, payer, "Pago a" payee, amount in
// words, concept, payment instructions, acceptance line and legal note). No logo, no
// colours. Everything comes from the account snapshot, never from live data.
export interface BillingDocument {
  company: { name: string; nit: string; phone: string; email: string; website?: string; address?: string; city: string; paymentInfo: string; legalNote: string }
  /** Kept for compatibility with stored snapshots; the minimalist layout does not print it. */
  logo?: PdfLogo
  /** Digits only: "01", "02", ... "10". */
  number: string
  issuedAt: string
  dueAt?: string | null
  customer: { name: string; businessName?: string | null; taxId?: string | null; email?: string | null; phone?: string | null; address?: string | null; city?: string | null }
  concept: string
  totalCents: number
  amountInWords: string
  period?: string | null
  status: 'ISSUED' | 'VOID'
}

const BLACK: [number, number, number] = [0, 0, 0]
const GRAY: [number, number, number] = [90, 90, 90]

export async function billingPdf(data: BillingDocument) {
  const { doc } = await loadPdf()
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight()
  const issuer = pdfText(data.company.name, 'SIP SOPORTE')
  const customerName = pdfText(data.customer.businessName || data.customer.name, 'Cliente')
  doc.setProperties({ title: `Cuenta de cobro ${pdfText(data.number)}`, subject: pdfText(data.concept), author: issuer, creator: issuer })
  const textWidth = width - MARGIN * 2
  let y = 22

  const write = (text: string, options: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; color?: [number, number, number]; gap?: number; x?: number } = {}) => {
    const lines = doc.splitTextToSize(pdfText(text), textWidth)
    const lineHeight = (options.size || 10) * 0.5
    if (y + lines.length * lineHeight > height - 30) { doc.addPage(); y = 22 }
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal'); doc.setFontSize(options.size || 10); doc.setTextColor(...(options.color || BLACK))
    const x = options.x ?? (options.align === 'center' ? width / 2 : options.align === 'right' ? width - MARGIN : MARGIN)
    doc.text(lines, x, y, { align: options.align || 'left' })
    y += lines.length * lineHeight + (options.gap ?? 2)
  }

  // Issuer header: name and phone, separated by a thin rule.
  write(issuer, { size: 13, bold: true, gap: 1 })
  if (data.company.phone) write(`TEL ${data.company.phone}`, { size: 10, bold: true, gap: 1 })
  doc.setDrawColor(...BLACK); doc.setLineWidth(0.4); doc.line(MARGIN, y + 1, width - MARGIN, y + 1)
  y += 8

  // Reference block, right-aligned like the reference document.
  const place = data.company.city ? `${pdfText(data.company.city)}, ${bogotaDate(data.issuedAt)}` : bogotaDate(data.issuedAt)
  const refX = width / 2 - 10
  const ref = (label: string, value: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...BLACK)
    doc.text(label, refX, y)
    doc.setFont('helvetica', 'bold')
    const lines = doc.splitTextToSize(pdfText(value), width - MARGIN - refX - 42)
    doc.text(lines, refX + 42, y)
    y += lines.length * 5 + 1.5
  }
  ref('Cuenta de cobro No.:', data.number)
  ref('Ciudad y fecha:', place)
  ref('Vencimiento:', data.dueAt ? bogotaDate(data.dueAt) : 'Contra entrega')
  if (data.period) ref('Período:', periodLabel(data.period))
  y += 8

  // Payer and payee, centred.
  write(customerName, { size: 12, bold: true, align: 'center', gap: 1 })
  if (data.customer.taxId) write(`CC / NIT ${data.customer.taxId}`, { size: 10, bold: true, align: 'center', gap: 1 })
  if (data.customer.businessName && data.customer.businessName !== data.customer.name) write(data.customer.name, { size: 9, align: 'center', color: GRAY, gap: 1 })
  y += 3
  write('Pago a', { size: 10, bold: true, align: 'center', gap: 4 })
  write(issuer, { size: 11, bold: true, align: 'center', gap: 1 })
  if (data.company.nit) write(`CC / NIT ${data.company.nit}`, { size: 10, bold: true, align: 'center', gap: 1 })
  if (data.company.legalNote.trim()) write('(responsable del IVA - Régimen Simplificado)', { size: 9, align: 'center', color: GRAY, gap: 1 })
  y += 8

  // Amount in words and concept: a plain wrapped paragraph (justifying with maxWidth re-wraps long concepts on top of each other).
  write(`La suma de ${data.amountInWords} (${formatMoney(data.totalCents)}) por concepto de ${data.concept}.`, { size: 10, gap: 4 })
  write(`Total a pagar: ${formatMoney(data.totalCents)}`, { size: 11, bold: true, gap: 6 })

  write(`Se firma en ${data.company.city ? pdfText(data.company.city) : 'Colombia'}, el ${bogotaDate(data.issuedAt)}.`, { size: 10, gap: 4 })
  if (data.company.paymentInfo.trim()) {
    write('Páguese la cuenta', { size: 10, gap: 2 })
    write(data.company.paymentInfo, { size: 10, bold: true, gap: 2 })
  }
  write(issuer, { size: 10, bold: true, gap: 2 })
  y += 10

  // Acceptance line for the customer.
  if (y + 26 > height - 30) { doc.addPage(); y = 22 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...BLACK)
  doc.text('Aceptada:', MARGIN, y); y += 14
  doc.setDrawColor(...BLACK); doc.setLineWidth(0.3); doc.line(MARGIN, y, MARGIN + 80, y); y += 5
  doc.setFont('helvetica', 'bold'); doc.text(doc.splitTextToSize(customerName.toUpperCase(), 80)[0], MARGIN + 2, y); y += 8

  // Legal note and status.
  if (data.company.legalNote.trim()) {
    const note = doc.splitTextToSize(pdfText(data.company.legalNote), textWidth)
    const noteY = Math.max(y + 4, height - 20 - note.length * 3.8)
    if (noteY + note.length * 3.8 > height - 12) { doc.addPage(); y = 22 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLACK)
    doc.text(note, MARGIN, noteY > y ? noteY : y)
  }
  const pages = doc.getNumberOfPages()
  const generated = bogotaDateTime(new Date().toISOString())
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY)
    doc.text(`Cuenta de cobro ${pdfText(data.number)} | Generada el ${generated}`, MARGIN, height - 8)
    if (pages > 1) doc.text(`Página ${page} de ${pages}`, width - MARGIN, height - 8, { align: 'right' })
    if (data.status === 'VOID') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(48); doc.setTextColor(170, 170, 170)
      doc.text('ANULADA', width / 2, height / 2, { align: 'center', angle: 30 })
    }
  }
  return pdfBytes(doc)
}
