import type { jsPDF } from 'jspdf'
import { pdfText } from '@/lib/order-pdf'

// Letterhead shared by quotes and billing accounts. It mirrors the service order
// document (band, stripe, footer) so every customer-facing PDF looks the same.
export const BLUE: [number, number, number] = [6, 61, 146]
export const NAVY: [number, number, number] = [7, 22, 83]
export const MUTED: [number, number, number] = [100, 116, 139]
export const LINE: [number, number, number] = [219, 230, 250]
export const INK: [number, number, number] = [15, 23, 42]
export const MARGIN = 14

export type PdfLogo = { dataUrl: string; format: 'PNG' | 'JPEG' }
export interface DocCompany {
  name: string
  nit: string
  phone: string
  email: string
  website: string
  address: string
  city: string
}

export async function loadPdf() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  return { doc, autoTable }
}

export const finalY = (doc: jsPDF) => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0

/** Blue band with logo, company identity and the document title/number on the right. Returns the Y below the stripe. */
export function drawLetterhead(doc: jsPDF, options: { company: DocCompany; logo?: PdfLogo; title: string; number: string; subtitle?: string }) {
  const width = doc.internal.pageSize.getWidth()
  const { company } = options
  doc.setFillColor(...BLUE); doc.rect(0, 0, width, 34, 'F')
  let textX = MARGIN
  if (options.logo) {
    try {
      const props = doc.getImageProperties(options.logo.dataUrl)
      const logoHeight = 20, logoWidth = Math.min(40, logoHeight * props.width / props.height)
      doc.setFillColor(255, 255, 255); doc.roundedRect(MARGIN - 2, 5, logoWidth + 4, logoHeight + 4, 2, 2, 'F')
      doc.addImage(options.logo.dataUrl, options.logo.format, MARGIN, 7, logoWidth, logoHeight)
      textX = MARGIN + logoWidth + 7
    } catch { /* A damaged logo must not prevent the document. */ }
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(doc.splitTextToSize(pdfText(company.name, 'SIP SOPORTE'), 90)[0], textX, 14)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(219, 230, 250)
  const identity = [company.nit && `NIT ${company.nit}`, company.website].filter(Boolean).map(value => pdfText(value)).join('  |  ')
  if (identity) doc.text(doc.splitTextToSize(identity, 90)[0], textX, 20)
  const contact = [company.phone && `Tel. ${company.phone}`, company.email].filter(Boolean).map(value => pdfText(value)).join('  |  ')
  if (contact) doc.text(doc.splitTextToSize(contact, 90)[0], textX, 25)
  doc.setFontSize(8); doc.text(pdfText(options.title).toUpperCase(), width - MARGIN, 12, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255)
  doc.text(pdfText(options.number), width - MARGIN, 20, { align: 'right' })
  if (options.subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(219, 230, 250); doc.text(pdfText(options.subtitle), width - MARGIN, 26, { align: 'right' }) }
  // Brand stripe shared with the application sidebar and the service orders.
  const stripe: Array<[number, [number, number, number]]> = [[0.34, [255, 81, 79]], [0.33, [255, 191, 0]], [0.33, [134, 196, 73]]]
  let stripeX = 0
  for (const [share, color] of stripe) { doc.setFillColor(...color); doc.rect(stripeX, 34, width * share + 0.2, 1.5, 'F'); stripeX += width * share }
  return 41
}

/** Footer on every page: company contact line, generation note and page numbers. */
export function drawFooter(doc: jsPDF, options: { company: DocCompany; reference: string; generatedAt: string }) {
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight()
  const pages = doc.getNumberOfPages()
  const contact = [options.company.address, options.company.city, options.company.phone && `Tel. ${options.company.phone}`, options.company.email, options.company.website].filter(Boolean).map(value => pdfText(value)).join('  |  ')
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(MARGIN, height - 15, width - MARGIN, height - 15)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    if (contact) doc.text(doc.splitTextToSize(contact, width - MARGIN * 2 - 30)[0], MARGIN, height - 11)
    doc.text(`${pdfText(options.company.name, 'SIP SOPORTE')} | ${pdfText(options.reference)} | Generado el ${pdfText(options.generatedAt)} (hora de Colombia)`, MARGIN, height - 7)
    doc.text(`Página ${page} de ${pages}`, width - MARGIN, height - 7, { align: 'right' })
  }
}

export const pdfBytes = (doc: jsPDF) => new Uint8Array(doc.output('arraybuffer'))
