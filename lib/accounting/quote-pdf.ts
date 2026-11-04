import type { RowInput } from 'jspdf-autotable'
import { pdfText, bogotaDate, bogotaDateTime } from '@/lib/order-pdf'
import { formatMoney, formatNumber } from './format'
import { BLUE, NAVY, MUTED, LINE, INK, MARGIN, drawLetterhead, drawFooter, finalY, loadPdf, pdfBytes, type DocCompany, type PdfLogo } from './pdf-brand'

// Same engine for the live preview in the editor, the download and the email attachment.
export interface QuoteDocumentCustomer { name: string; businessName?: string | null; taxId?: string | null; email?: string | null; phone?: string | null; address?: string | null; city?: string | null }
export interface QuoteDocumentItem { name: string; description?: string | null; quantity: number; unitPriceCents: number; totalCents: number }
export interface QuoteDocument {
  company: DocCompany
  logo?: PdfLogo
  /** "COT-0001" or "Borrador" while editing. */
  number: string
  date: string
  customer: QuoteDocumentCustomer
  items: QuoteDocumentItem[]
  subtotalCents: number
  taxName?: string | null
  taxRatePercent: number | null
  taxCents: number
  totalCents: number
  title?: string
  notes?: string | null
  conditions?: string | null
}

export async function quotePdf(data: QuoteDocument) {
  const { doc, autoTable } = await loadPdf()
  const width = doc.internal.pageSize.getWidth()
  const title = pdfText(data.title, 'Cotización')
  doc.setProperties({ title: `${title} ${pdfText(data.number)}`, subject: title, author: pdfText(data.company.name, 'SIP SOPORTE'), creator: pdfText(data.company.name, 'SIP SOPORTE') })
  let y = drawLetterhead(doc, { company: data.company, logo: data.logo, title, number: data.number, subtitle: `Fecha: ${bogotaDate(data.date)}` })

  // Customer block and quote reference side by side.
  const customer = data.customer
  const customerRows: Array<[string, string]> = [
    ['Razón social', customer.businessName || customer.name],
    ...(customer.businessName && customer.businessName !== customer.name ? [['Contacto', customer.name] as [string, string]] : []),
    ['NIT / C.C.', customer.taxId || ''],
    ['Correo', customer.email || ''], ['Teléfono', customer.phone || ''],
    ['Dirección', [customer.address, customer.city].filter(Boolean).join(', ')],
  ].filter(([, value]) => value) as Array<[string, string]>
  autoTable(doc, {
    startY: y, margin: { left: MARGIN, right: MARGIN }, theme: 'grid', tableWidth: (width - MARGIN * 2) * 0.62,
    head: [[{ content: 'CLIENTE', colSpan: 2 }]], body: customerRows.map(([label, value]): RowInput => [label, pdfText(value)]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak', lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30, textColor: NAVY } },
  })
  const customerEnd = finalY(doc)
  const infoX = MARGIN + (width - MARGIN * 2) * 0.62 + 4
  autoTable(doc, {
    startY: y, margin: { left: infoX, right: MARGIN }, theme: 'grid', tableWidth: width - MARGIN - infoX,
    head: [[{ content: 'DATOS DE LA COTIZACIÓN', colSpan: 2 }]],
    body: [['Número', pdfText(data.number)], ['Fecha', bogotaDate(data.date)], ['Moneda', 'Pesos colombianos (COP)']],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak', lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: [238, 243, 252], textColor: BLUE, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 20, textColor: NAVY } },
  })
  y = Math.max(customerEnd, finalY(doc)) + 6

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK)
  doc.text('De acuerdo con lo solicitado nos permitimos presentar la siguiente cotización.', MARGIN, y)
  y += 4

  const items = data.items.length ? data.items : [{ name: 'Sin productos', description: '', quantity: 0, unitPriceCents: 0, totalCents: 0 }]
  autoTable(doc, {
    startY: y, margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 20 }, theme: 'grid',
    head: [['ITEM', 'DESCRIPCIÓN', 'CANTIDAD', 'VALOR UNIT.', 'VALOR TOTAL']],
    body: items.map((item, index): RowInput => [
      String(index + 1).padStart(2, '0'),
      pdfText([item.name, item.description].filter(Boolean).join('\n')),
      item.quantity ? formatNumber(item.quantity) : '',
      formatMoney(item.unitPriceCents), formatMoney(item.totalCents),
    ]),
    foot: [
      [{ content: 'Subtotal', colSpan: 4, styles: { halign: 'right' } }, formatMoney(data.subtotalCents)],
      ...(data.taxRatePercent != null ? [[{ content: `${pdfText(data.taxName, 'Impuesto')} (${formatNumber(data.taxRatePercent)} %)`, colSpan: 4, styles: { halign: 'right' as const } }, formatMoney(data.taxCents)]] : []),
      [{ content: 'Total', colSpan: 4, styles: { halign: 'right', fontSize: 10 } }, { content: formatMoney(data.totalCents), styles: { fontSize: 10 } }],
    ],
    showFoot: 'lastPage', rowPageBreak: 'auto',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.4, overflow: 'linebreak', valign: 'top', lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
    footStyles: { fillColor: [238, 243, 252], textColor: NAVY, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 22, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 32, halign: 'right' } },
  })
  y = finalY(doc) + 6

  const block = (heading: string, text: string) => {
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 20 }, theme: 'grid',
      head: [[heading.toUpperCase()]], body: [[pdfText(text)]], showHead: 'everyPage', rowPageBreak: 'auto',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, overflow: 'linebreak', lineColor: LINE, lineWidth: 0.2, textColor: INK },
      headStyles: { fillColor: [238, 243, 252], textColor: BLUE, fontStyle: 'bold', fontSize: 8.5 },
    })
    y = finalY(doc) + 6
  }
  if (data.notes?.trim()) block('Observaciones', data.notes)
  if (data.conditions?.trim()) block('Formas de pago y consideraciones', data.conditions)

  const height = doc.internal.pageSize.getHeight()
  if (y + 22 > height - 20) { doc.addPage(); y = 16 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK)
  doc.text('Cordialmente,', MARGIN, y + 4)
  doc.setFont('helvetica', 'bold'); doc.text(pdfText(data.company.name, 'SIP SOPORTE'), MARGIN, y + 12)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
  const contact = [data.company.nit && `NIT ${data.company.nit}`, data.company.phone, data.company.email].filter(Boolean).map(value => pdfText(value)).join('  |  ')
  if (contact) doc.text(contact, MARGIN, y + 17)

  drawFooter(doc, { company: data.company, reference: `${title} ${data.number}`, generatedAt: bogotaDateTime(new Date().toISOString()) })
  return pdfBytes(doc)
}
