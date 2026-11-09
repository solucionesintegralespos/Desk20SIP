import { staffUser, serviceError } from '@/lib/accounting/server'
import { xlsx, XLSX_TYPE } from '@/lib/xlsx'
import { fareStatusLabels } from '@/lib/schedule'
import { formatDateTimeCO } from '@/lib/accounting/format'
import { fareRows, parseFareRange } from '@/lib/fares-report'

export const dynamic = 'force-dynamic'

// Excel export of the fares in the selected range, with a total row.
export async function GET(request: Request) {
  try {
    await staffUser()
    const { from, to, tech } = parseFareRange(new URL(request.url).searchParams)
    const rows = await fareRows(from, to, tech)
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
