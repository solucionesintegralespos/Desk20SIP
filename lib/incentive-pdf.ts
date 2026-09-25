import type { IncentiveResults, SavedIncentivePlan } from './incentives'

export async function incentivePdf(plan: SavedIncentivePlan, results: IncentiveResults, responsible: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const money = (value: number) => '$ ' + value.toLocaleString('es-CO', { maximumFractionDigits: 0 })
  const number = (value: number | null | undefined) => value == null ? '-' : value.toLocaleString('es-CO', { maximumFractionDigits: 2 })
  doc.setProperties({ title: `Incentivos - ${plan.leaderName} - ${plan.month}`, author: 'SIP SOPORTE' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(6, 61, 146)
  doc.text('Incentivos de líderes', 12, 17)
  autoTable(doc, {
    startY: 23, margin: { left: 12, right: 12 }, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ['Mes', plan.month, 'Liquidación', plan.closedAt ? 'Cerrada' : 'Estimado provisional'],
      ['Líder', plan.leaderName, 'Responsable', responsible],
      ['Calculado', new Date(results.calculatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }), 'Moneda', 'Pesos colombianos (COP)'],
      ...(plan.closedAt ? [['Cierre', new Date(plan.closedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }), 'Cerrado por', plan.closedBy || '-']] : []),
    ], columnStyles: { 0: { fontStyle: 'bold', cellWidth: 24 }, 1: { cellWidth: 110 }, 2: { fontStyle: 'bold', cellWidth: 27 } },
  })
  const metadataEnd = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  autoTable(doc, {
    startY: metadataEnd + 5, margin: { left: 12, right: 12, top: 12, bottom: 16 },
    head: [['Grupo', 'Indicador', 'Dato 1', 'Dato 2', 'Meta %', 'Logrado %', 'Incentivo COP', 'Estado', 'A liquidar COP']],
    body: plan.indicators.map(indicator => {
      const row = results.rows.find(r => r.id === indicator.id)
      return [indicator.group, indicator.name + (!indicator.confirmed ? '\nRegla por confirmar' : '') + (indicator.note ? `\nNota: ${indicator.note}` : ''),
        number(row?.numerator), number(row?.denominator), `${indicator.direction === 'at_least' ? 'Min.' : 'Max.'} ${number(indicator.target)}`,
        number(row?.percentage), money(indicator.amount), !row || row.status === 'pending' ? 'Pendiente' : row.status === 'met' ? 'Cumple' : 'No cumple', money(row?.payout || 0)]
    }),
    foot: [[{ content: 'TOTAL A LIQUIDAR (COP)', colSpan: 8, styles: { halign: 'right' } }, money(results.total)]],
    showFoot: 'lastPage', rowPageBreak: 'avoid', theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, overflow: 'linebreak', valign: 'top', lineColor: [220, 226, 235], lineWidth: 0.2 },
    headStyles: { fillColor: [6, 61, 146], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [230, 239, 252], textColor: [6, 61, 146], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 89 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 6: { halign: 'right' }, 8: { halign: 'right' } },
  })
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100)
    doc.text('SIP SOPORTE | Los indicadores pendientes no generan incentivo.', 12, 202)
    doc.text(`Página ${page} de ${pages}`, 285, 202, { align: 'right' })
  }
  return doc
}
