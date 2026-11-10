import type { RowInput } from 'jspdf-autotable'
import { pdfText, bogotaDateTime } from '@/lib/order-pdf'
import { BLUE, NAVY, MUTED, LINE, INK, MARGIN, drawLetterhead, drawFooter, finalY, loadPdf, pdfBytes, type DocCompany, type PdfLogo } from '@/lib/accounting/pdf-brand'
import type { CountRow, CountTotals } from './counts'
import { shortCountId } from './counts'

// Physical count report: theoretical vs counted units per product and the resulting adjustment.
export interface CountDocument {
  company: DocCompany
  logo?: PdfLogo
  id: string
  performedAt: string
  performedBy: string
  notes: string
  rows: CountRow[]
  totals: CountTotals
}

const signed = (value: number) => value > 0 ? `+${value}` : String(value)
const GREEN: [number, number, number] = [22, 101, 52]
const RED: [number, number, number] = [185, 28, 28]

export async function countPdf(data: CountDocument) {
  const { doc, autoTable } = await loadPdf()
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight()
  const reference = shortCountId(data.id)
  doc.setProperties({ title: `Conteo de inventario ${reference}`, subject: 'Conteo físico de inventario', author: pdfText(data.company.name, 'SIP SOPORTE'), creator: pdfText(data.company.name, 'SIP SOPORTE') })
  let y = drawLetterhead(doc, { company: data.company, logo: data.logo, title: 'Conteo de inventario', number: reference, subtitle: bogotaDateTime(data.performedAt) })

  autoTable(doc, {
    startY: y, margin: { left: MARGIN, right: MARGIN }, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 }, textColor: MUTED },
    body: [
      ['PRODUCTOS CONTADOS', 'TEÓRICO', 'FÍSICO', 'DIFERENCIA', 'CON DIFERENCIA'],
      [String(data.totals.products), String(data.totals.theoretical), String(data.totals.counted), signed(data.totals.difference), String(data.totals.withDifference)]
        .map((content, index) => ({ content, styles: { fontSize: 10, fontStyle: 'bold' as const, textColor: index === 3 ? (data.totals.difference < 0 ? RED : data.totals.difference > 0 ? GREEN : NAVY) : NAVY } })),
    ],
  })
  y = finalY(doc) + 4
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED)
  doc.text(`Realizado por ${pdfText(data.performedBy)} el ${bogotaDateTime(data.performedAt)} (hora de Colombia). Las existencias quedaron ajustadas al valor físico.`, MARGIN, y)
  y += 6

  autoTable(doc, {
    startY: y, margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 20 }, theme: 'grid',
    head: [['#', 'PRODUCTO', 'TEÓRICO', 'FÍSICO', 'DIFERENCIA']],
    body: data.rows.map((row, index): RowInput => [
      String(index + 1), pdfText(row.name), String(row.theoretical), String(row.counted),
      { content: signed(row.difference), styles: { fontStyle: 'bold', textColor: row.difference < 0 ? RED : row.difference > 0 ? GREEN : MUTED } },
    ]),
    foot: [[{ content: 'Totales', colSpan: 2, styles: { halign: 'right' } }, String(data.totals.theoretical), String(data.totals.counted), { content: signed(data.totals.difference), styles: { textColor: data.totals.difference < 0 ? RED : data.totals.difference > 0 ? GREEN : NAVY } }]],
    showFoot: 'lastPage', rowPageBreak: 'auto',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, overflow: 'linebreak', valign: 'top', lineColor: LINE, lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [238, 243, 252], textColor: NAVY, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 24, halign: 'right' }, 3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' } },
  })
  y = finalY(doc) + 6

  if (data.notes.trim()) {
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 20 }, theme: 'grid',
      head: [['OBSERVACIONES']], body: [[pdfText(data.notes)]], showHead: 'everyPage', rowPageBreak: 'auto',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, overflow: 'linebreak', lineColor: LINE, lineWidth: 0.2, textColor: INK },
      headStyles: { fillColor: [238, 243, 252], textColor: BLUE, fontStyle: 'bold', fontSize: 8.5 },
    })
    y = finalY(doc) + 6
  }

  if (y + 30 > height - 20) { doc.addPage(); y = 16 }
  y += 14
  const half = (width - MARGIN * 2 - 10) / 2
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.3)
  doc.line(MARGIN, y, MARGIN + half, y); doc.line(MARGIN + half + 10, y, width - MARGIN, y)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK)
  doc.text('Realizado por', MARGIN, y + 5); doc.text('Revisado por', MARGIN + half + 10, y + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
  doc.text(doc.splitTextToSize(pdfText(data.performedBy), half)[0], MARGIN, y + 9.5)

  drawFooter(doc, { company: data.company, reference: `Conteo ${reference}`, generatedAt: bogotaDateTime(new Date().toISOString()) })
  return pdfBytes(doc)
}
