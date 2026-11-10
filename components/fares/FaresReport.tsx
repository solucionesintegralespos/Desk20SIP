'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Bus, Check, Download, Loader2, Trash2, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/components/accounting/api'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui'
import { formatMoney, formatDateCO, formatDateTimeCO, currentPeriod, previousPeriod } from '@/lib/accounting/format'
import { fareStatusLabels, timeLabel, type FareStatus } from '@/lib/schedule'
import { canUseAccounting, isAdmin } from '@/lib/roles'
import { serviceDay } from '@/lib/support/order-display'

type Person = { id: string; name: string }
type FareRow = { id: string; date: string; start: string; title: string; reason: string; amountCents: number; status: FareStatus; paidAt: string | null; revision: number; technicians: Person[]; customer: Person | null }
type Totals = { count: number; totalCents: number; pendingCents: number; acceptedCents: number; paidCents: number }
type Response = { from: string; to: string; paidUntil: string | null; canManage: boolean; fares: FareRow[]; totals: Totals; technicians: Person[] }

const monthRange = (period: string) => {
  const [year, month] = period.split('-').map(Number)
  return { from: `${period}-01`, to: `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}` }
}
const statusClass: Record<FareStatus, string> = { pending: 'bg-amber-50 text-amber-800', accepted: 'bg-blue-50 text-blue-800', paid: 'bg-green-50 text-green-800' }
const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const dayLabel = (date: string) => formatDateCO(`${date}T12:00:00-05:00`)

export default function FaresReport() {
  const { data: session } = useSession()
  // Administration and accounting manage every fare; agents only see their own (the API enforces both).
  const canManage = canUseAccounting(session?.user?.role) || isAdmin(session?.user?.role)
  const today = serviceDay(new Date().toISOString())
  const [range, setRange] = useState(() => monthRange(currentPeriod()))
  const [tech, setTech] = useState('')
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState<{ row: FareRow; action: 'accept' | 'remove' } | null>(null)
  const [payUntil, setPayUntil] = useState(today)
  const [confirmPay, setConfirmPay] = useState(false)
  const [busy, setBusy] = useState(false)

  const query = useMemo(() => { const params = new URLSearchParams({ from: range.from, to: range.to }); if (tech) params.set('tech', tech); return params.toString() }, [range, tech])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await api<Response>(`/api/fares?${query}`)) } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [query])
  useEffect(() => { void load() }, [load])

  async function act() {
    if (!acting || busy) return
    setBusy(true)
    try {
      await api(`/api/fares/${encodeURIComponent(acting.row.id)}`, { method: 'POST', json: { action: acting.action, revision: acting.row.revision } })
      toast.success(acting.action === 'accept' ? 'Pasaje aceptado' : 'Pasaje eliminado del evento')
      setActing(null); await load()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  async function pay() {
    if (busy) return
    setBusy(true)
    try {
      const result = await api<{ count: number; totalCents: number; paidUntil: string }>('/api/fares/pay', { method: 'POST', json: { until: payUntil } })
      toast.success(`${result.count} pasaje${result.count === 1 ? '' : 's'} marcado${result.count === 1 ? '' : 's'} como pagado${result.count === 1 ? '' : 's'} (${formatMoney(result.totalCents)})`, { duration: 7000 })
      setConfirmPay(false); await load()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const rows = data?.fares || []
  const totals = data?.totals
  const unpaidUntil = rows.filter(row => row.status !== 'paid' && row.date <= payUntil)
  const payWithinRange = payUntil >= range.from && payUntil <= range.to
  const techOptions = (data?.technicians || []).map(person => ({ id: person.id, label: person.name }))

  return <>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3"><Bus className="text-primary-600" /> Pasajes</h1>
        <p className="text-gray-600 mt-1">{canManage ? 'Pasajes registrados en los eventos de la programación, con su total y estado de pago.' : 'Tus pasajes registrados en los eventos de la programación, con su total y estado de pago. Contabilidad los acepta y los marca como pagados.'}</p>
      </div>
      <a href={`/api/fares/export?${query}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"><Download className="h-4 w-4" /> Exportar a Excel</a>
    </div>

    <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      <label className="text-sm font-medium text-gray-700">Desde<input type="date" value={range.from} max={range.to} onChange={e => e.target.value && setRange(current => ({ ...current, from: e.target.value }))} className={`${inputClass} mt-1`} /></label>
      <label className="text-sm font-medium text-gray-700">Hasta<input type="date" value={range.to} min={range.from} onChange={e => e.target.value && setRange(current => ({ ...current, to: e.target.value }))} className={`${inputClass} mt-1`} /></label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setRange(monthRange(currentPeriod()))} className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Este mes</button>
        <button type="button" onClick={() => setRange(monthRange(previousPeriod(currentPeriod())))} className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Mes anterior</button>
      </div>
      {canManage && <div className="w-full md:w-64">
        <span className="block text-sm font-medium text-gray-700 mb-1">Ingeniero</span>
        <SearchSelect aria-label="Ingeniero" placeholder="Buscar ingeniero…" emptyOption="Todos los ingenieros" value={tech} onChange={setTech} options={techOptions} />
      </div>}
    </div>

    {data?.paidUntil && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">Pasajes pagados hasta el <strong>{dayLabel(data.paidUntil)}</strong>. Los eventos hasta esa fecha ya no admiten cambios en sus pasajes.</p>}
    {data && !data.canManage && <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Solo ves tus propios pasajes. Para registrar uno, agrégalo al evento en Programación; aceptarlos, eliminarlos o marcarlos como pagados corresponde a Contabilidad y Administración.</p>}

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {[['Pasajes', totals ? String(totals.count) : '—'], ['Total del período', totals ? formatMoney(totals.totalCents) : '—'], ['Pendientes', totals ? formatMoney(totals.pendingCents) : '—'], ['Aceptados', totals ? formatMoney(totals.acceptedCents) : '—'], ['Pagados', totals ? formatMoney(totals.paidCents) : '—']].map(([label, value], index) =>
        <div key={label} className={`bg-white rounded-lg shadow p-4 ${index === 1 ? 'border-l-4 border-primary-600' : ''}`}><p className="text-xs uppercase tracking-wider text-gray-500">{label}</p><p className={`mt-1 font-semibold tabular-nums ${index === 1 ? 'text-2xl text-primary-700' : 'text-xl text-gray-900'}`}>{value}</p></div>)}
    </div>

    {canManage && <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-col gap-3 md:flex-row md:items-end">
      <label className="text-sm font-medium text-gray-700">Marcar como pagados hasta<input type="date" value={payUntil} max={today} onChange={e => e.target.value && setPayUntil(e.target.value)} className={`${inputClass} mt-1`} /></label>
      <Button disabled={busy || loading} onClick={() => setConfirmPay(true)}><Wallet size={16} /> Marcar como pagados</Button>
      <p className="text-xs text-gray-500 md:ml-2">Todos los pasajes pendientes o aceptados hasta esa fecha quedan pagados y los eventos de esas fechas dejan de admitir pasajes.</p>
    </div>}

    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700 mb-4">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
    {loading && !data ? <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">Cargando pasajes…</div>
      : rows.length === 0 ? <div className="bg-white rounded-lg shadow p-12 text-center"><Bus className="h-10 w-10 mx-auto text-gray-300 mb-3" /><p className="text-gray-500 text-lg">No hay pasajes en este período</p><p className="text-gray-400 mt-2">Los pasajes se registran en cada evento de la programación.</p></div>
      : <div className={`bg-white rounded-lg shadow overflow-hidden ${loading ? 'opacity-60' : ''}`}><div className="overflow-x-auto"><table className="w-full">
        <thead className="bg-gray-50"><tr>{['Fecha', 'Ingeniero(s)', 'Cliente', 'Evento', 'Motivo', 'Valor', 'Estado', ...(canManage ? ['Acciones'] : [])].map(label => <th key={label} scope="col" className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${label === 'Valor' ? 'text-right' : 'text-left'}`}>{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-200">{rows.map(row => <tr key={row.id} className="hover:bg-gray-50 align-top">
          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{dayLabel(row.date)}<div className="text-xs text-gray-500">{timeLabel(row.start)}</div></td>
          <td className="px-4 py-3 text-sm text-gray-900">{row.technicians.map(t => t.name).join(', ')}</td>
          <td className="px-4 py-3 text-sm text-gray-700">{row.customer?.name || <span className="text-gray-400">—</span>}</td>
          <td className="px-4 py-3 text-sm text-gray-900">{row.title}</td>
          <td className="px-4 py-3 text-sm text-gray-700 max-w-xs"><span className="line-clamp-2" title={row.reason}>{row.reason}</span></td>
          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold tabular-nums text-gray-900">{formatMoney(row.amountCents)}</td>
          <td className="px-4 py-3 whitespace-nowrap text-sm"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[row.status]}`}>{fareStatusLabels[row.status]}</span>{row.paidAt && <div className="text-xs text-gray-500 mt-1">{formatDateTimeCO(row.paidAt)}</div>}</td>
          {canManage && <td className="px-4 py-3 whitespace-nowrap"><div className="flex gap-1">
            <button type="button" disabled={row.status !== 'pending' || busy} onClick={() => setActing({ row, action: 'accept' })} title={row.status === 'pending' ? 'Aceptar pasaje' : 'Ya fue aceptado o pagado'} aria-label={`Aceptar pasaje de ${row.title}`} className="p-2 rounded-lg text-gray-600 hover:bg-green-50 hover:text-green-700 disabled:opacity-40 disabled:cursor-not-allowed"><Check className="h-4 w-4" /></button>
            <button type="button" disabled={row.status === 'paid' || busy} onClick={() => setActing({ row, action: 'remove' })} title={row.status === 'paid' ? 'Un pasaje pagado no se puede eliminar' : 'Eliminar pasaje del evento'} aria-label={`Eliminar pasaje de ${row.title}`} className="p-2 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 className="h-4 w-4" /></button>
          </div></td>}
        </tr>)}</tbody>
        <tfoot className="bg-gray-50"><tr><td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total</td><td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-900">{formatMoney(totals?.totalCents || 0)}</td><td colSpan={canManage ? 2 : 1} /></tr></tfoot>
      </table></div></div>}

    <Dialog open={!!acting} onOpenChange={open => { if (!open && !busy) setActing(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{acting?.action === 'accept' ? 'Aceptar pasaje' : 'Eliminar pasaje'}</DialogTitle><DialogDescription>{acting && <>{acting.action === 'accept' ? 'Se aceptará el pasaje de' : 'Se quitará el pasaje de'} <strong>{formatMoney(acting.row.amountCents)}</strong> del evento «{acting.row.title}» del {dayLabel(acting.row.date)}{acting.action === 'remove' ? '. El evento se conserva sin pasaje.' : '.'}</>}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setActing(null)}>Cancelar</Button><Button disabled={busy} onClick={() => void act()}>{busy ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : acting?.action === 'accept' ? 'Aceptar' : 'Eliminar'}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={confirmPay} onOpenChange={open => { if (!open && !busy) setConfirmPay(false) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar pasajes como pagados</DialogTitle><DialogDescription>Hasta el <strong>{dayLabel(payUntil)}</strong>{payWithinRange ? <>: <strong>{unpaidUntil.length}</strong> pasaje{unpaidUntil.length === 1 ? '' : 's'} sin pagar en el período mostrado ({formatMoney(unpaidUntil.reduce((sum, row) => sum + row.amountCents, 0))})</> : ' (la fecha está fuera del período mostrado; se incluirán todos los pasajes pendientes o aceptados hasta ese día)'}. Después de esta fecha no se podrán registrar ni modificar pasajes en esos eventos.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmPay(false)}>Cancelar</Button><Button disabled={busy} onClick={() => void pay()}>{busy ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : 'Confirmar pago'}</Button></div>
      </DialogContent>
    </Dialog>
  </>
}
