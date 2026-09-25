'use client'
import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Download, Search, FileText, CheckCircle, Clock, CircleAlert } from 'lucide-react'
import { serviceDay } from '@/lib/support/order-display'

type Row = { id: string; name: string; avatar: string | null; entered: number; closed: number; entryGoal: number | null; closureGoal: number | null }
type Report = {
  month: string; label: string; technician: string; category: string; unattributed: number;
  summary: { entered: number; closed: number; open: number; pending: number };
  technicians: { id: string; name: string | null; email: string | null }[]; categories: { id: string; name: string }[];
  rows: Row[]; activity: { day: string; entered: number; closed: number }[]; byCategory: { name: string; count: number }[]
}
const percent = (count: number, goal: number | null) => goal ? Math.round(count / goal * 100) : null
function Progress({ count, goal, color }: { count: number; goal: number | null; color: string }) {
  const value = percent(count, goal)
  return <div className="flex min-w-32 items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="Cumplimiento de meta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.min(value,100)}><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value || 0, 100)}%` }} /></div><span className="whitespace-nowrap text-sm font-semibold">{value === null ? 'Sin meta' : `${value}%`}</span></div>
}
export default function ReportsDashboard() {
  const [month, setMonth] = useState(() => serviceDay(new Date().toISOString()).slice(0,7))
  const [technician, setTechnician] = useState(''), [category, setCategory] = useState('')
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const requestId = useRef(0)
  async function consult() {
    const id = ++requestId.current
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/reports?${new URLSearchParams({ month, technician, category })}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw Error(result.error)
      if (id === requestId.current) setData(result)
    } catch (e) { if (id === requestId.current) setError((e as Error).message) }
    finally { if (id === requestId.current) setLoading(false) }
  }
  useEffect(() => { void consult(); return () => { requestId.current++ } }, [])
  function download() {
    if (!data) return
    const rows: (string | number)[][] = [
      ['Reporte mensual', data.label], ['Técnico', data.technicians.find(t => t.id === data.technician)?.name || 'Todos'], ['Categoría', data.categories.find(c => c.id === data.category)?.name || 'Todas'],
      ['Digitados', data.summary.entered, 'Cerrados', data.summary.closed, 'Abiertos actuales', data.summary.open, 'Pendientes actuales', data.summary.pending],
      ['Técnico', 'Digitados', 'Meta mensual digitación', 'Cumplimiento %', 'Cerrados', 'Meta mensual cierres', 'Cumplimiento %'],
      ...data.rows.map(r => [r.name, r.entered, r.entryGoal ?? 'Sin meta', percent(r.entered,r.entryGoal) ?? '', r.closed, r.closureGoal ?? 'Sin meta', percent(r.closed,r.closureGoal) ?? '']),
      [], ['Día', 'Digitados', 'Cerrados'], ...data.activity.map(r => [r.day, r.entered, r.closed]),
      [], ['Categoría', 'Tickets digitados'], ...data.byCategory.map(r => [r.name,r.count]),
      [], ['Nota', 'Metas configuradas actualmente. Abiertos y pendientes corresponden al estado actual.'], ['Sin autor de digitación', data.unattributed],
    ]
    const escape = (value: string | number) => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"'
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(escape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `reporte-${data.month}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const input = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm'
  const panel = 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm'
  const cards = [
    { label: 'Digitados en el mes', key: 'entered', icon: FileText, color: 'text-violet-700 bg-violet-50' },
    { label: 'Cerrados en el mes', key: 'closed', icon: CheckCircle, color: 'text-emerald-700 bg-emerald-50' },
    { label: 'Abiertos actuales', key: 'open', icon: Clock, color: 'text-blue-700 bg-blue-50' },
    { label: 'Pendientes actuales', key: 'pending', icon: CircleAlert, color: 'text-amber-700 bg-amber-50' },
  ] as const
  return <div className="space-y-5">
    <form onSubmit={e => { e.preventDefault(); void consult() }} className={`${panel} grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto]`}>
      <label className="text-sm font-medium">Mes<input required type="month" min="2000-01" value={month} onChange={e => setMonth(e.target.value)} className={input} /></label>
      <label className="text-sm font-medium">Técnico<select value={technician} onChange={e => setTechnician(e.target.value)} className={input}><option value="">Todos los técnicos</option>{data?.technicians.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}</select></label>
      <label className="text-sm font-medium">Categoría<select value={category} onChange={e => setCategory(e.target.value)} className={input}><option value="">Todas las categorías</option>{data?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button disabled={loading} className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-white disabled:opacity-50"><Search size={16} />{loading ? 'Consultando…' : 'Consultar'}</button>
      <button type="button" disabled={!data || loading || !!error} onClick={download} className="flex items-center justify-center gap-2 rounded-lg border border-primary-600 px-5 py-2 text-primary-600 disabled:opacity-50"><Download size={16} />Exportar CSV</button>
    </form>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error} Vuelve a pulsar Consultar.</p>}
    {loading && <p role="status" className="text-sm text-gray-500">Cargando reporte mensual…</p>}
    {data && !loading && !error && <>
      <p className="text-sm text-gray-500 capitalize">{data.label} · {data.technicians.find(t => t.id === data.technician)?.name || 'Todos los técnicos'} · {data.categories.find(c => c.id === data.category)?.name || 'Todas las categorías'}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(c => <div key={c.key} className={`${panel} flex items-center gap-4`}><div className={`rounded-xl p-3 ${c.color}`}><c.icon size={24} /></div><div><p className="text-sm text-gray-600">{c.label}</p><p className="mt-1 text-3xl font-bold">{data.summary[c.key]}</p></div></div>)}</div>
      <section className={panel}><h2 className="text-xl font-semibold">Cumplimiento de metas por técnico</h2><p className="mt-1 text-sm text-gray-500">Actividad del mes · Metas mensuales individuales</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr>{['Técnico','Digitados / Meta','Cumplimiento','Cerrados / Meta','Cumplimiento'].map((s,i) => <th key={i} className="p-3 font-medium">{s}</th>)}</tr></thead><tbody>{data.rows.map(r => <tr key={r.id} className="border-b border-gray-100"><td className="p-3"><div className="flex min-w-40 items-center gap-3">{r.avatar ? <img src={r.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">{r.name[0]}</span>}<span>{r.name}</span></div></td><td className="p-3 whitespace-nowrap">{r.entered} / {r.entryGoal ?? '—'}</td><td className="p-3 text-violet-700"><Progress count={r.entered} goal={r.entryGoal} color="bg-violet-500" /></td><td className="p-3 whitespace-nowrap">{r.closed} / {r.closureGoal ?? '—'}</td><td className="p-3 text-blue-700"><Progress count={r.closed} goal={r.closureGoal} color="bg-blue-500" /></td></tr>)}</tbody></table>{!data.rows.length && <p className="p-6 text-center text-gray-500">No hay técnicos para mostrar.</p>}</div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]"><section className={panel}><h2 className="mb-4 font-semibold">Actividad durante el mes</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.activity}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line dataKey="entered" name="Digitados" stroke="#8b5cf6" strokeWidth={2} dot={false} /><Line dataKey="closed" name="Cerrados" stroke="#3b82f6" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></section>
        <section className={panel}><h2 className="font-semibold">Tickets por categoría</h2><p className="mt-1 text-xs text-gray-500">Digitados en el mes seleccionado</p><div className="mt-5 max-h-60 space-y-4 overflow-y-auto">{data.byCategory.map(c => <div key={c.name}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{c.name}</span><strong>{c.count}</strong></div><div className="h-3 rounded-full bg-gray-100"><div className="h-3 rounded-full bg-blue-500" style={{ width: `${c.count / Math.max(...data.byCategory.map(v => v.count),1) * 100}%` }} /></div></div>)}{!data.byCategory.length && <p className="py-10 text-center text-sm text-gray-500">Sin tickets en este período.</p>}</div></section></div>
      <p className="text-xs leading-5 text-gray-500">Mes calendario · Hora de Colombia. Metas configuradas actualmente; el filtro de categoría compara su actividad con la meta mensual completa. Abiertos y pendientes son el estado actual de los tickets asignados, independientemente del mes. Los cierres se atribuyen a quien los realizó y dejan de contar al reabrirse.{data.unattributed > 0 && ` Hay ${data.unattributed} tickets sin autor registrado incluidos en el total, pero no en las metas individuales.`}</p>
    </>}
  </div>
}
