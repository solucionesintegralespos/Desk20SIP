'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Save, LockKeyhole, Pencil, Download } from 'lucide-react'
import { incentiveCsv } from '@/lib/incentive-export'
import toast from 'react-hot-toast'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/support/ui'
import { exampleIndicators, type Indicator, type IncentivePlan, type SavedIncentivePlan, type IncentiveResults } from '@/lib/incentives'

type Person = { id: string; name: string | null; email: string | null }
type Plan = SavedIncentivePlan & { revision: number; results: IncentiveResults }
type Data = { plans: Plan[]; staff: Person[]; categories: { id: string; name: string }[] }
const money = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
const currentMonth = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).format(new Date())
const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const sourceLabels = { first_contact: 'Cerrados el mismo día / tickets recibidos', same_day_urgent: 'Urgentes cerrados el mismo día / urgentes recibidos', backlog: 'Abiertos con más de 30 días / backlog permitido', manual: 'Datos registrados / fuente externa', created: 'Tickets creados / meta registrada', urgent: 'Tickets cerrados dentro del plazo / tickets de las prioridades seleccionadas', projects: 'Proyectos cerrados dentro del plazo / proyectos recibidos', weekend: 'Tickets creados sábado y domingo / meta registrada' }
const fieldClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900'

export default function Incentives() {
  const [month, setMonth] = useState(currentMonth)
  const [data, setData] = useState<Data>({ plans: [], staff: [], categories: [] })
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState<IncentivePlan | null>(null)
  const [editing, setEditing] = useState<Indicator | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const plan = data.plans.find(p => p.leaderRole === selected)
  const displayed = draft || plan
  const locked = !!plan?.closedAt && !draft
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/incentives?month=${month}`, { cache: 'no-store', signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (signal?.aborted) return
      setData(result); setError('')
      setSelected(previous => previous || result.plans[0]?.leaderRole || '')
    } catch (e) { if (!signal?.aborted) setError((e as Error).message) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [month])
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort() }, [refresh])
  useEffect(() => {
    if (draft || busy) return
    const controller = new AbortController()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(controller.signal) }, 60000)
    return () => { clearInterval(timer); controller.abort() }
  }, [refresh, draft, busy])
  function changePeriod(value: string) {
    const period = value > currentMonth() ? currentMonth() : value
    if (period === month) return
    setLoading(true)
    setData({ plans: [], staff: [], categories: [] })
    setMonth(period)
  }
  function update(change: Partial<IncentivePlan>) {
    if (displayed) setDraft({ month: displayed.month, leaderRole: displayed.leaderRole, leaderId: displayed.leaderId, teamIds: displayed.teamIds, indicators: displayed.indicators, ...change })
  }
  async function save(action: 'save' | 'close') {
    if (!displayed) return
    setBusy(true)
    try {
      const response = await fetch('/api/incentives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, revision: plan?.revision || 0, plan: displayed }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setSelected(displayed.leaderRole); setDraft(null); setClosing(false)
      await refresh()
      toast.success(action === 'close' ? 'Liquidación cerrada y conservada' : 'Indicadores guardados y recalculados')
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  async function copyPrevious() {
    if (!displayed) return
    setBusy(true)
    try {
      const [year, number] = month.split('-').map(Number)
      const date = new Date(Date.UTC(year, number - 2, 1))
      const previousMonth = date.toISOString().slice(0, 7)
      const response = await fetch(`/api/incentives?month=${previousMonth}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      const previous = (result.plans as Plan[]).find(p => p.leaderRole === displayed.leaderRole)
      if (!previous) throw new Error('Este líder no tiene un plan el mes anterior')
      update({ teamIds: previous.teamIds, indicators: previous.indicators.map(i => ({ ...i, numerator: null, denominator: i.source === 'manual' ? null : i.denominator, note: '' })) })
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  function addIndicator() {
    setEditing({ strictDays: false, id: crypto.randomUUID(), name: '', group: '', source: 'manual', direction: 'at_least', target: 80, amount: 25000, numerator: null, denominator: null, days: 3, categoryIds: [], tag: '', priorities: ['HIGH', 'URGENT'], confirmed: false, note: '' })
  }
  function download() {
    if (!plan || draft || loading || error) return
    const responsible = data.staff.find(person => person.id === plan.leaderId)
    const csv = incentiveCsv(plan, plan.results, responsible?.name || responsible?.email || 'Por asignar')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `incentivos-${plan.leaderRole}-${month}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function downloadPdf() {
    if (!plan || draft || loading || error || exportingPdf) return
    setExportingPdf(true)
    try {
      const { incentivePdf } = await import('@/lib/incentive-pdf')
      const responsible = data.staff.find(person => person.id === plan.leaderId)
      const pdf = await incentivePdf(plan, plan.results, responsible?.name || responsible?.email || 'Por asignar')
      pdf.save(`incentivos-${plan.leaderRole}-${plan.month}.pdf`)
    } catch { toast.error('No se pudo generar el PDF. Intenta nuevamente.') }
    finally { setExportingPdf(false) }
  }
  return <div className="h-full min-h-0 overflow-y-auto p-4 md:p-8 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Incentivos de líderes</h1><p className="text-sm text-gray-500">Seguimiento mensual, cumplimiento y liquidación en pesos colombianos.</p></div><div className="flex flex-wrap items-end gap-2"><Button variant="outline" disabled={!plan || !!draft || busy || loading || !!error} onClick={download} title={draft ? 'Guarda los cambios antes de descargar' : 'Descargar indicadores del líder y mes seleccionados'}><Download size={16} />Descargar CSV</Button><Button variant="outline" disabled={!plan || !!draft || busy || loading || !!error || exportingPdf} onClick={downloadPdf} title={draft ? 'Guarda los cambios antes de descargar' : 'Descargar PDF del líder y mes seleccionados'}><Download size={16} />{exportingPdf ? 'Generando PDF…' : 'Descargar PDF'}</Button><label className="text-sm">Mes<select aria-label="Mes de incentivos" value={month.slice(5)} disabled={!!draft || busy} onChange={e => changePeriod(`${month.slice(0, 4)}-${e.target.value}`)} className={fieldClass}>{monthNames.map((name, index) => { const number = String(index + 1).padStart(2, '0'); return <option key={number} value={number} disabled={`${month.slice(0, 4)}-${number}` > currentMonth()}>{name}</option> })}</select></label><label className="text-sm">Año<select aria-label="Año de incentivos" value={month.slice(0, 4)} disabled={!!draft || busy} onChange={e => changePeriod(`${e.target.value}-${month.slice(5)}`)} className={fieldClass}>{Array.from({ length: Number(currentMonth().slice(0, 4)) - 1999 }, (_, index) => Number(currentMonth().slice(0, 4)) - index).map(year => <option key={year} value={year}>{year}</option>)}</select></label><Button variant="outline" disabled={busy || !!draft || loading} onClick={() => void refresh()} aria-label="Actualizar indicadores"><RefreshCw size={16} /></Button></div></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="grid gap-3 md:grid-cols-3">{[
      ['Líderes configurados', data.plans.length], ['Estimado en meses abiertos', money(data.plans.filter(p => !p.closedAt).reduce((sum, p) => sum + p.results.total, 0))], ['Total de liquidaciones cerradas', money(data.plans.filter(p => p.closedAt).reduce((sum, p) => sum + p.results.total, 0))],
    ].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div>
    <div className="flex flex-wrap gap-2">{data.plans.map(p => <button type="button" key={p.leaderRole} disabled={!!draft || busy} onClick={() => setSelected(p.leaderRole)} className={`rounded-lg border px-4 py-2 text-sm disabled:opacity-50 ${selected === p.leaderRole ? 'bg-primary-600 text-white' : 'bg-white'}`}>{p.leaderName} · {p.closedAt ? 'Cerrado' : p.indicators.length ? 'En seguimiento' : 'Sin indicadores'}</button>)}</div>
    {loading ? <p>Cargando indicadores…</p> : !displayed ? <div className="rounded-xl border bg-white p-8 text-center"><h2 className="font-semibold">Configura los indicadores de cada líder</h2><p className="mt-2 text-sm text-gray-500">Agrega un líder, selecciona su equipo y define sus reglas. Puedes usar la hoja de referencia como borrador.</p></div> : <section className="rounded-xl border bg-white p-4 space-y-4">
      <fieldset disabled={locked || busy || !!error} className="space-y-4 disabled:opacity-80">
        <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Líder responsable<select className={fieldClass} disabled={busy || locked} value={displayed.leaderId} onChange={e => update({ leaderId: e.target.value })}><option value="">Por asignar</option>{data.staff.map(p => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}</select></label><div><p className="text-sm font-medium">Equipo cuyos tickets se contabilizan</p><div className="mt-1 flex max-h-28 flex-wrap gap-3 overflow-y-auto rounded-lg border p-2">{data.staff.map(p => <label key={p.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={displayed.teamIds.includes(p.id)} onChange={e => update({ teamIds: e.target.checked ? [...displayed.teamIds, p.id] : displayed.teamIds.filter(id => id !== p.id) })} />{p.name || p.email}</label>)}</div></div></div>
        {!locked && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={addIndicator}><Plus size={16} />Indicador</Button>{!displayed.indicators.length && displayed.leaderRole === 'helpdesk' && <><Button size="sm" variant="outline" onClick={() => update({ indicators: exampleIndicators() })}>Cargar borrador FE / POS de la imagen</Button></>}<Button size="sm" variant="outline" onClick={copyPrevious}>Copiar reglas del mes anterior</Button></div>}
      </fieldset>
      {draft && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Cambios sin guardar. Guarda para calcular los resultados; los datos de la imagen son una referencia y requieren confirmar sus reglas.</p>}
      {locked && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Liquidación cerrada el {new Date(plan.closedAt!).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} por {plan.closedBy}. Se conservan los valores de ese cierre.</p>}
      <p className="text-sm text-gray-500">{displayed.indicators.length} indicadores · Desplázate hacia abajo para ver el listado completo y el total.</p><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-600"><tr>{['Indicador', 'Dato 1', 'Dato 2', 'Meta', 'Logrado', 'Incentivo', 'Estado', 'A liquidar', ''].map((h, n) => <th key={n} className="p-3">{h}</th>)}</tr></thead><tbody>{displayed.indicators.map(indicator => {
        const row = !draft ? plan?.results.rows.find(r => r.id === indicator.id) : undefined
        const pending = !row || row.status === 'pending'
        return <tr key={indicator.id} className="border-t align-top"><td className="p-3"><span className="text-xs font-semibold text-primary-600">{indicator.group}</span><p className="max-w-sm font-medium">{indicator.name}</p><p className="mt-1 text-xs text-gray-500">{indicator.source === 'manual' ? 'Dato registrado' : 'Automático'}{!indicator.confirmed && ' · Regla por confirmar'}</p>{!!row?.ticketNumbers.length && <details className="mt-1 text-xs"><summary className="cursor-pointer text-primary-600">Ver tickets contabilizados ({row.ticketNumbers.length})</summary><p className="max-h-24 max-w-sm overflow-auto">{row.ticketNumbers.map(n => `#${n}`).join(', ')}</p></details>}</td><td className="p-3">{row?.numerator ?? '—'}</td><td className="p-3">{row?.denominator ?? '—'}</td><td className="p-3 whitespace-nowrap">{indicator.direction === 'at_least' ? '≥' : '≤'} {indicator.target} %</td><td className="p-3">{row?.percentage == null ? '—' : `${row.percentage.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`}</td><td className="p-3 whitespace-nowrap">{money(indicator.amount)}</td><td className="p-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${pending ? 'bg-amber-50 text-amber-800' : row.status === 'met' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{pending ? 'Pendiente' : row.status === 'met' ? 'Cumple' : 'No cumple'}</span></td><td className="p-3 whitespace-nowrap font-semibold">{row ? money(row.payout) : '—'}</td><td className="p-3"><Button size="sm" variant="outline" disabled={busy || !!error} onClick={() => setEditing(structuredClone(indicator))} aria-label={`${locked ? 'Ver' : 'Editar'} ${indicator.name}`}><Pencil size={14} />{locked ? 'Ver' : 'Editar'}</Button></td></tr>
      })}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><p className="text-sm text-gray-500">{locked ? 'Total a pagar del mes' : 'Incentivo estimado hasta ahora'}</p><p className="text-2xl font-bold">{draft ? 'Por calcular' : money(plan?.results.total || 0)}</p>{plan && !draft && <p className="text-xs text-gray-500">Calculado: {new Date(plan.results.calculatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>}</div><div className="flex flex-wrap gap-2">{draft && <Button disabled={busy} variant="outline" onClick={() => setDraft(null)}>Descartar cambios</Button>}{!locked && <><Button disabled={busy || !!error} onClick={() => save('save')}><Save size={16} />Guardar y calcular</Button><Button variant="outline" disabled={busy || !!draft || month >= currentMonth() || !plan || !plan.indicators.length || !plan.leaderId || plan.results.rows.some(r => r.status === 'pending') || !!error} onClick={() => setClosing(true)}><LockKeyhole size={16} />Cerrar liquidación</Button></>}</div></div>
      <p className="text-xs leading-relaxed text-gray-500">Los cálculos automáticos se actualizan cada minuto y usan tickets creados en el mes, con la asignación y clasificación actuales. El plazo se mide en horas transcurridas (24 horas por día), no en días hábiles ni «mismo día». Primer contacto exige creación y cierre el mismo día en Colombia. El backlog cuenta tickets abiertos de más de 30 días al corte y utiliza el historial de estados disponible. La liquidación se puede cerrar al terminar el mes, cuando no existan indicadores pendientes.</p>
    </section>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null) }}><DialogContent><DialogHeader><DialogTitle>{locked ? 'Regla del indicador' : 'Configurar indicador'}</DialogTitle></DialogHeader>{editing && <form onSubmit={e => { e.preventDefault(); if (locked) return; update({ indicators: displayed!.indicators.some(i => i.id === editing.id) ? displayed!.indicators.map(i => i.id === editing.id ? editing : i) : [...displayed!.indicators, editing] }); setEditing(null) }}><fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Nombre / fórmula<input required maxLength={250} className={fieldClass} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
      <label className="text-sm">Grupo (FE, POS u otro)<input className={fieldClass} maxLength={50} value={editing.group} onChange={e => setEditing({ ...editing, group: e.target.value })} /></label>
      <label className="text-sm">Fuente<select className={fieldClass} value={editing.source} onChange={e => setEditing({ ...editing, source: e.target.value as Indicator['source'], confirmed: false })}>{Object.entries(sourceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-sm">Cumple cuando<select className={fieldClass} value={editing.direction} onChange={e => setEditing({ ...editing, direction: e.target.value as Indicator['direction'], confirmed: false })}><option value="at_least">Es mayor o igual a la meta (≥)</option><option value="at_most">Es menor o igual a la meta (≤)</option></select></label>
      <label className="text-sm">Meta %<input className={fieldClass} type="number" min="0" max="100000" step="0.01" required value={editing.target} onChange={e => setEditing({ ...editing, target: Number(e.target.value), confirmed: false })} /></label>
      <label className="text-sm">Incentivo si cumple (COP)<input className={fieldClass} type="number" min="0" max="100000000" step="1" required value={editing.amount} onChange={e => setEditing({ ...editing, amount: Number(e.target.value), confirmed: false })} /></label>
      {editing.source === 'manual' && <label className="text-sm">Dato 1 · numerador<input className={fieldClass} type="number" min="0" max="100000000" step="1" value={editing.numerator ?? ''} onChange={e => setEditing({ ...editing, numerator: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
      {['manual', 'created', 'weekend', 'backlog'].includes(editing.source) && <label className="text-sm">Dato 2 · denominador / meta en cantidad<input className={fieldClass} type="number" min="0" max="100000000" step="1" value={editing.denominator ?? ''} onChange={e => setEditing({ ...editing, denominator: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
      {editing.source !== 'manual' && <><label className="text-sm">Etiqueta exacta del ticket (opcional)<input className={fieldClass} value={editing.tag} maxLength={100} placeholder="Sin etiqueta: todos" onChange={e => setEditing({ ...editing, tag: e.target.value, confirmed: false })} /></label><div className="text-sm sm:col-span-2">Categorías (ninguna seleccionada = todas)<div className="mt-1 flex max-h-28 flex-wrap gap-3 overflow-auto rounded border p-2">{data.categories.map(c => <label key={c.id}><input type="checkbox" checked={editing.categoryIds.includes(c.id)} onChange={e => setEditing({ ...editing, categoryIds: e.target.checked ? [...editing.categoryIds, c.id] : editing.categoryIds.filter(id => id !== c.id), confirmed: false })} /> {c.name}</label>)}</div></div></>}
      {['urgent', 'projects'].includes(editing.source) && <><label className="text-sm">Plazo en días de 24 horas<input required type="number" min="1" max="365" step="1" className={fieldClass} value={editing.days} onChange={e => setEditing({ ...editing, days: Number(e.target.value), confirmed: false })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.strictDays} onChange={e => setEditing({ ...editing, strictDays: e.target.checked, confirmed: false })} />Exigir menos del plazo (excluir el límite exacto)</label></>}
      {['urgent', 'same_day_urgent'].includes(editing.source) && <div className="text-sm">Prioridades<div className="mt-2 flex flex-wrap gap-2">{(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((value, index) => <label key={value}><input type="checkbox" checked={editing.priorities.includes(value)} onChange={e => setEditing({ ...editing, priorities: e.target.checked ? [...editing.priorities, value] : editing.priorities.filter(p => p !== value), confirmed: false })} /> {['Baja', 'Normal', 'Alta', 'Urgente'][index]}</label>)}</div></div>}
      <label className="text-sm sm:col-span-2">Soporte / observaciones<textarea className={fieldClass} maxLength={2000} rows={3} placeholder="Origen de los datos, criterios y observaciones del mes" value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={editing.confirmed} onChange={e => setEditing({ ...editing, confirmed: e.target.checked })} />He revisado la fórmula, la comparación, el alcance y el incentivo.</label>
      {!locked && <div className="flex justify-between gap-2 sm:col-span-2"><Button type="submit">Aplicar al borrador</Button>{displayed?.indicators.some(i => i.id === editing.id) && <Button variant="outline" onClick={() => { update({ indicators: displayed.indicators.filter(i => i.id !== editing.id) }); setEditing(null) }}>Quitar indicador</Button>}</div>}
    </fieldset></form>}</DialogContent></Dialog>
    <Dialog open={closing} onOpenChange={setClosing}><DialogContent><DialogHeader><DialogTitle>Cerrar liquidación de {month}</DialogTitle></DialogHeader><p className="text-sm">Se conservarán las reglas, los datos y el total de <strong>{money(plan?.results.total || 0)}</strong> de {plan?.leaderName}. El cierre recalcula los indicadores con los datos actuales y no permite modificar este mes después.</p><div className="mt-4 flex gap-2"><Button disabled={busy} onClick={() => save('close')}>Confirmar cierre mensual</Button><Button disabled={busy} variant="outline" onClick={() => setClosing(false)}>Cancelar</Button></div></DialogContent></Dialog>
  </div>
}
