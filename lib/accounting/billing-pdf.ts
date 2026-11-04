import type { RowInput } from 'jspdf-autotable'
import { pdfText, bogotaDate, bogotaDateTime } from '@/lib/order-pdf'
import { formatMoney, periodLabel } from './format'
import { BLUE, NAVY, MUTED, LINE, INK, MARGIN, drawLetterhead, drawFooter, finalY, loadPdf, pdfBytes, type DocCompany, type PdfLogo } from './pdf-brand'

// Cuenta de cobro. Reproduces the reference document (number, city and date, due date,
// payer, payee, amount in words, concept, payment instructions, acceptance and legal note)
// on the system letterhead. Everything comes from the account snapshot, never from live data.
export interface BillingDocument {
  company: DocCompany & { paymentInfo: string; legalNote: string }
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

export async function billingPdf(data: BillingDocument) {
  const { doc, autoTable } = await loadPdf()
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight()
  const company = pdfText(data.company.name, 'SIP SOPORTE')
  doc.setProperties({ title: `Cuenta de cobro ${pdfText(data.number)}`, subject: pdfText(data.concept), author: company, creator: company })
  let y = drawLetterhead(doc, { company: data.company, logo: data.logo, title: 'Cuenta de cobro', number: `No. ${data.number}`, subtitle: data.status === 'VOID' ? 'ANULADA' : data.period ? periodLabel(data.period) : undefined })

  const place = data.company.city ? `${pdfText(data.company.city)}, ${bogotaDate(data.issuedAt)}` : bogotaDate(data.issuedAt)
  autoTable(doc, {
    startY: y, margin: { left: MARGIN, right: MARGIN }, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 }, textColor: MUTED },
    body: [
      ['CUENTA DE COBRO No.', 'CIUDAD Y FECHA', 'VENCIMIENTO', 'ESTADO'],
      [data.number, place, data.dueAt ? bogotaDate(data.dueAt) : 'Contra entrega', data.status === 'VOID' ? 'Anulada' : 'Emitida'].map(content => ({ content: pdfText(content), styles: { fontSize: 10, fontStyle: 'bold' as const, textColor: NAVY } })),
    ],
  })
  y = finalY(doc) + 6

  const customerName = data.customer.businessName || data.customer.name
  const party = (heading: string, rows: Array<[string, string]>, x: number, tableWidth: number) => autoTable(doc, {
    startY: y, margin: { left: x, right: MARGIN }, tableWidth, theme: 'grid',
    head: [[{ content: heading, colSpan: 2 }]], body: rows.filter(([, value]) => value).map(([label, value]): RowInput => [label, pdfText(value)]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak', lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 24, textColor: NAVY } },
  })
  const half = (width - MARGIN * 2 - 4) / 2
  party('DEBE A (CLIENTE)', [
    ['Nombre', customerName], ...(data.customer.businessName && data.customer.businessName !== data.customer.name ? [['Contacto', data.customer.name] as [string, string]] : []),
    ['NIT / C.C.', data.customer.taxId || ''], ['Correo', data.customer.email || ''], ['Teléfono', data.customer.phone || ''],
    ['Dirección', [data.customer.address, data.customer.city].filter(Boolean).join(', ')],
  ], MARGIN, half)
  const leftEnd = finalY(doc)
  party('PAGO A (BENEFICIARIO)', [
    ['Nombre', data.company.name], ['NIT / C.C.', data.company.nit], ['Teléfono', data.company.phone], ['Correo', data.company.email],
    ['Dirección', [data.company.address, data.company.city].filter(Boolean).join(', ')],
  ], MARGIN + half + 4, half)
  y = Math.max(leftEnd, finalY(doc)) + 8

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK)
  const amount = doc.splitTextToSize(`La suma de ${pdfText(data.amountInWords)} (${formatMoney(data.totalCents)}) por concepto de: ${pdfText(data.concept)}.`, width - MARGIN * 2)
  doc.text(amount, MARGIN, y)
  y += amount.length * 5 + 2

  autoTable(doc, {
    startY: y, margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 20 }, theme: 'grid',
    head: [['CONCEPTO', 'VALOR']], body: [[pdfText(data.concept), formatMoney(data.totalCents)]],
    foot: [[{ content: 'TOTAL A PAGAR', styles: { halign: 'right' } }, formatMoney(data.totalCents)]],
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.6, overflow: 'linebreak', lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [238, 243, 252], textColor: NAVY, fontStyle: 'bold', fontSize: 10, halign: 'right' },
    columnStyles: { 1: { cellWidth: 40, halign: 'right' } },
  })
  y = finalY(doc) + 7

  const paragraph = (text: string, bold = false) => {
    const lines = doc.splitTextToSize(pdfText(text), width - MARGIN * 2)
    if (y + lines.length * 4.6 > height - 22) { doc.addPage(); y = 16 }
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9); doc.setTextColor(...INK)
    doc.text(lines, MARGIN, y)
    y += lines.length * 4.6 + 2
  }
  paragraph(`Se firma en ${data.company.city ? pdfText(data.company.city) : 'Colombia'}, el ${bogotaDate(data.issuedAt)}.`)
  if (data.company.paymentInfo.trim()) { paragraph('Páguese la cuenta:', true); paragraph(data.company.paymentInfo) }

  if (y + 36 > height - 22) { doc.addPage(); y = 16 }
  y += 4
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.3)
  doc.line(MARGIN, y + 14, MARGIN + 75, y + 14)
  doc.line(width - MARGIN - 75, y + 14, width - MARGIN, y + 14)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK)
  doc.text(company, MARGIN, y + 19); doc.text('Aceptada:', width - MARGIN - 75, y + 19)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
  if (data.company.nit) doc.text(`NIT / C.C. ${pdfText(data.company.nit)}`, MARGIN, y + 23.5)
  doc.text(doc.splitTextToSize(pdfText(customerName), 75)[0], width - MARGIN - 75, y + 23.5)
  y += 32

  if (data.company.legalNote.trim()) {
    const lines = doc.splitTextToSize(pdfText(data.company.legalNote), width - MARGIN * 2)
    if (y + lines.length * 3.8 > height - 20) { doc.addPage(); y = 16 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text(lines, MARGIN, y)
  }

  if (data.status === 'VOID') {
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page); doc.setFont('helvetica', 'bold'); doc.setFontSize(48); doc.setTextColor(220, 38, 38)
      doc.text('ANULADA', width / 2, height / 2, { align: 'center', angle: 30 })
    }
  }
  drawFooter(doc, { company: data.company, reference: `Cuenta de cobro ${data.number}`, generatedAt: bogotaDateTime(new Date().toISOString()) })
  return pdfBytes(doc)
}
