import type { IncentiveResults, SavedIncentivePlan } from './incentives'

function cell(value: string | number | null | undefined): string {
  if (value == null) return '""'
  if (typeof value === 'number') return String(value).replace('.', ',')
  // Keep user-entered names and notes as text when opened in Excel.
  const safe = /^[\s\uFEFF]*[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function incentiveCsv(plan: SavedIncentivePlan, results: IncentiveResults, responsible: string) {
  const rows: Array<Array<string | number | null>> = [
    ['INCENTIVOS DE LÍDERES'],
    ['Mes', plan.month], ['Líder', plan.leaderName], ['Responsable', responsible],
    ['Liquidación', plan.closedAt ? 'Cerrada' : 'Estimado provisional'],
    ['Fecha del cálculo', results.calculatedAt],
    ...(plan.closedAt ? [['Fecha de cierre', plan.closedAt], ['Cerrado por', plan.closedBy || '']] : []),
    ['Moneda', 'COP'], [],
    ['Grupo', 'Indicador', 'Dato 1', 'Dato 2', 'Comparación', 'Meta %', 'Logrado %', 'Incentivo COP', 'Estado', 'A liquidar COP', 'Regla', 'Observaciones'],
    ...plan.indicators.map(indicator => {
      const result = results.rows.find(row => row.id === indicator.id)
      return [indicator.group, indicator.name, result?.numerator ?? null, result?.denominator ?? null,
        indicator.direction === 'at_least' ? 'Mayor o igual' : 'Menor o igual', indicator.target, result?.percentage ?? null,
        indicator.amount, !result || result.status === 'pending' ? 'Pendiente' : result.status === 'met' ? 'Cumple' : 'No cumple',
        result?.payout ?? 0, indicator.confirmed ? 'Confirmada' : 'Por confirmar', indicator.note]
    }),
    ['', 'TOTAL A LIQUIDAR (COP)', '', '', '', '', '', '', '', results.total],
  ]
  return '\uFEFFsep=;\r\n' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n'
}
