import { staffUser, serviceError } from '@/lib/accounting/server'
import { canUseAccounting } from '@/lib/roles'
import { xlsx, XLSX_TYPE } from '@/lib/xlsx'
import { fareStatusLabels } from '@/lib/schedule'
import { formatDateTimeCO } from '@/lib/accounting/format'
import { fareRows, parseFareRange } from '@/lib/fares-report'

export const dynamic = 'force-dynamic'

// Excel export of the fares in the selected range, with a total row. Agents export only their own fares.
export async function GET(request: Request) {
  try {
    const user = await staffUser()
    const range = parseFareRange(new URL(request.url).searchParams)
    const { from, to } = range
    const rows = await fareRows(from, to, canUseAccounting(user.role) ? range.tech : user.id)
    const total = rows.reduce((sum, row) => sum + row.amountCents, 0) / 100
    const file = xlsx({
      name: 'Pasajes',
      columns: [{ header: 'Fecha', width: 12 }, { header: 'Hora', width: 8 }, { header: 'Ingeniero(s)', width: 28 }, { header: 'Cliente', width: 28 }, { header: 'Evento', width: 32 }, { header: 'Motivo', width: 32 }, { header: 'Valor', width: 14 }, { header: 'Estado', width: 12 }, { header: 'Fecha de pago', width: 20 }],
      rows: [
        ...rows.map(row => [row.date, row.start, row.technicians.map(t => t.name).join(', '), row.customer?.name || '', row.title, row.reason, row.amountCents / 100, fareStatusLabels[row.status], row.paidAt ? formatDateTimeCO(row.paidAt) : '']),
        ['Total', '', '', '', '', '', total, '', ''],
      ],
    })
    return new Response(new Uint8Array(file), { headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="pasajes-${from}_${to}.xlsx"`,
      'Cache-Control': 'private, no-store',
    } })
  } catch (error) { return serviceError(error) }
}
