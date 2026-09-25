import type { CellInput, RowInput } from 'jspdf-autotable'

export interface OrderPdfData {
  orgName: string
  logo?: { data: Uint8Array; format: 'PNG' | 'JPEG' }
  number: string
  status: 'in_progress' | 'completed'
  createdAt: string
  serviceName: string
  startTime: string
  endTime?: string
  technician: string
  client: { name: string; email: string; phone: string; address: string; city: string }
  ticket?: { number: string; subject: string; priority: string }
  checklistNumber?: string
  diagnosis: string
  workDone: string
  observations: string
  signerName: string
  signedAt?: string
  signature?: string
  consent: boolean
}

export const orderStatusLabels = { in_progress: 'En proceso', completed: 'Completada' } as const
const BLUE: [number, number, number] = [6, 61, 146]
const NAVY: [number, number, number] = [7, 22, 83]
const MUTED: [number, number, number] = [100, 116, 139]
const zone = { timeZone: 'America/Bogota' } as const

// Standard PDF fonts use WinAnsi: map typographic characters and drop the rest
// so user text never renders as broken glyphs in Acrobat or mobile viewers.
export function pdfText(value: unknown, empty = 'No registrado') {
  const text = String(value ?? '').normalize('NFC')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[•●]/g, '-')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\n\t\x20-\x7E -ÿ]/g, '')
    .trim()
  return text || empty
}
const valid = (value?: string) => !!value && Number.isFinite(Date.parse(value))
export const bogotaDate = (value?: string) => valid(value) ? pdfText(new Intl.DateTimeFormat('es-CO', { ...zone, dateStyle: 'long' }).format(new Date(value!))) : 'Sin fecha registrada'
export const bogotaTime = (value?: string) => valid(value) ? pdfText(new Intl.DateTimeFormat('es-CO', { ...zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value!))) : 'Sin hora registrada'
export const bogotaDateTime = (value?: string) => valid(value) ? `${bogotaDate(value)}, ${bogotaTime(value)}` : 'Sin fecha registrada'

export async function orderPdf(order: OrderPdfData) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 14
  const orgName = pdfText(order.orgName, 'SIP SOPORTE')
  const number = pdfText(order.number, 'Orden de servicio')
  const status = orderStatusLabels[order.status] || 'En proceso'
  const finalY = () => (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  doc.setProperties({ title: `Orden de servicio ${number}`, subject: pdfText(order.serviceName), author: orgName, creator: orgName })

  // Header band with logo, organization and order reference.
  doc.setFillColor(...BLUE); doc.rect(0, 0, width, 34, 'F')
  let textX = margin
  if (order.logo) {
    try {
      const props = doc.getImageProperties(order.logo.data)
      const logoHeight = 20, logoWidth = Math.min(40, logoHeight * props.width / props.height)
      doc.setFillColor(255, 255, 255); doc.roundedRect(margin - 2, 5, logoWidth + 4, logoHeight + 4, 2, 2, 'F')
      doc.addImage(order.logo.data, order.logo.format, margin, 7, logoWidth, logoHeight)
      textX = margin + logoWidth + 7
    } catch { /* A damaged logo must not prevent the order document. */ }
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text(doc.splitTextToSize(orgName, 95)[0], textX, 16)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(219, 230, 250)
  doc.text('Sistema de Soporte Técnico', textX, 22)
  doc.setFontSize(8); doc.text('ORDEN DE SERVICIO', width - margin, 12, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255)
  doc.text(number, width - margin, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(219, 230, 250)
  doc.text(`Estado: ${status}`, width - margin, 26, { align: 'right' })
  // Brand stripe shared with the application sidebar.
  const stripe: Array<[number, [number, number, number]]> = [[0.34, [255, 81, 79]], [0.33, [255, 191, 0]], [0.33, [134, 196, 73]]]
  let stripeX = 0
  for (const [share, color] of stripe) { doc.setFillColor(...color); doc.rect(stripeX, 34, width * share + 0.2, 1.5, 'F'); stripeX += width * share }

  autoTable(doc, {
    startY: 41, margin: { left: margin, right: margin }, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 }, textColor: MUTED },
    body: [
      ['NÚMERO DE ORDEN', 'FECHA DE CREACIÓN', 'ESTADO', 'FECHA DEL SERVICIO'],
      [number, bogotaDate(order.createdAt), status, bogotaDate(order.startTime)].map(content => ({ content, styles: { fontSize: 10, fontStyle: 'bold' as const, textColor: NAVY } })),
    ],
  })

  const section = (title: string, rows: Array<[string, string]>) => autoTable(doc, {
    startY: finalY() + 6, margin: { left: margin, right: margin, top: 16, bottom: 18 }, theme: 'grid',
    head: [[{ content: title.toUpperCase(), colSpan: 2 }]], showHead: 'firstPage',
    body: rows.map(([label, value]): RowInput => [label, pdfText(value)]),
    rowPageBreak: 'auto',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.4, overflow: 'linebreak', valign: 'top', lineColor: [219, 230, 250], lineWidth: 0.2, textColor: [15, 23, 42] },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48, textColor: NAVY } },
  })
  const block = (title: string, value: string) => autoTable(doc, {
    startY: finalY() + 6, margin: { left: margin, right: margin, top: 16, bottom: 18 }, theme: 'grid',
    head: [[title.toUpperCase()]], body: [[pdfText(value) as CellInput]], showHead: 'everyPage', rowPageBreak: 'auto',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak', lineColor: [219, 230, 250], lineWidth: 0.2, textColor: [15, 23, 42] },
    headStyles: { fillColor: [238, 243, 252], textColor: BLUE, fontStyle: 'bold', fontSize: 9 },
  })

  section('Información del cliente', [
    ['Nombre', order.client.name], ['Email', order.client.email], ['Teléfono', order.client.phone],
    ['Dirección', [order.client.address, order.client.city].filter(Boolean).join(', ')],
  ])
  section('Información del servicio', [
    ['Servicio solicitado', order.serviceName],
    ['Técnico asignado', order.technician],
    ['Fecha programada', bogotaDate(order.startTime)],
    ['Hora programada', bogotaTime(order.startTime)],
    ['Prioridad', order.ticket?.priority || 'No aplica'],
    ['Estado', status],
    ...(order.ticket ? [['Ticket relacionado', `${order.ticket.number} - ${order.ticket.subject}`] as [string, string]] : []),
    ...(order.checklistNumber ? [['Checklist relacionado', order.checklistNumber] as [string, string]] : []),
    ...(order.endTime ? [['Finalizada', bogotaDateTime(order.endTime)] as [string, string]] : []),
  ])
  block('Descripción / diagnóstico', order.diagnosis)
  block('Trabajo realizado', order.workDone)
  block('Observaciones y recomendaciones', order.observations)
  section('Aceptación del cliente', [
    ['Recibido por', order.signerName],
    ['Fecha de firma', order.signedAt ? bogotaDateTime(order.signedAt) : 'Pendiente'],
    ['Aceptación', order.consent ? 'El cliente revisó el trabajo y las observaciones, y confirmó su recepción.' : 'Pendiente'],
  ])

  if (order.signature?.startsWith('data:image/png;base64,')) {
    let y = finalY() + 6
    if (y + 38 > height - 18) { doc.addPage(); y = 16 }
    doc.setDrawColor(219, 230, 250); doc.setLineWidth(0.2); doc.rect(margin, y, 80, 34)
    try { doc.addImage(order.signature, 'PNG', margin + 3, y + 2, 74, 24) } catch { /* Keep the document without an unreadable signature. */ }
    doc.setDrawColor(...MUTED); doc.line(margin + 5, y + 27, margin + 75, y + 27)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(`Firma: ${pdfText(order.signerName)}`, 70)[0], margin + 40, y + 31.5, { align: 'center' })
  }

  const generated = bogotaDateTime(new Date().toISOString())
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setDrawColor(219, 230, 250); doc.setLineWidth(0.2); doc.line(margin, height - 13, width - margin, height - 13)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text(`${orgName} | ${number} | Generado el ${generated} (hora de Colombia)`, margin, height - 8)
    doc.text(`Página ${page} de ${pages}`, width - margin, height - 8, { align: 'right' })
  }
  return Buffer.from(doc.output('arraybuffer'))
}
