'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowDownToLine, ArrowUpFromLine, Images, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, type CustomerOption } from '@/components/accounting/api'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Input, Textarea } from '@/components/support/ui'
import { SearchSelect } from '@/components/ui/SearchSelect'
import Pagination from '@/components/tickets/Pagination'
import { formatDateTimeCO } from '@/lib/accounting/format'
import { PhotoUpload } from './PhotoUpload'

type LoanItem = { id: string; productId: string; name: string; quantity: number }
type Loan = {
  id: string; number: number; numberLabel: string; items: LoanItem[]; units: number; itemsLabel: string
  customer: { id: string; name: string; businessName: string | null }; technician: { id: string; name: string }
  status: 'OUT' | 'RETURNED'; outAt: string; outNotes: string | null; outPhotos: string[]
  returnedAt: string | null; returnNotes: string | null; returnPhotos: string[]; ageLabel: string; days: number
}
type Person = { id: string; name: string }
type ProductOption = { id: string; name: string; stock: number; active: boolean }
type ListResponse = { loans: Loan[]; total: number; page: number; perPage: number; technicians: Person[]; products: ProductOption[] }
// Several pieces of equipment per exit order; each line is a product with its units.
type OutLine = { key: string; productId: string; quantity: string }
type OutDraft = { items: OutLine[]; customerId: string; technicianId: string; notes: string; photos: string[] }
// A return never stands alone: it points at the exit order it closes and inherits everything from it.
type ReturnDraft = { loanId: string; notes: string; photos: string[] }
const newLine = (): OutLine => ({ key: crypto.randomUUID(), productId: '', quantity: '1' })

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const customerLabel = (customer: { name: string; businessName: string | null }) => customer.businessName || customer.name

export default function Loans() {
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams()
  const { data: session } = useSession()
  const status = searchParams.get('status') || 'OUT', customer = searchParams.get('customer') || '', technician = searchParams.get('technician') || '', q = searchParams.get('q') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const [search, setSearch] = useState(q)
  const [data, setData] = useState<ListResponse | null>(null)
  const [openLoans, setOpenLoans] = useState<Loan[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [outDraft, setOutDraft] = useState<OutDraft | null>(null)
  const [returnDraft, setReturnDraft] = useState<ReturnDraft | null>(null)
  const [gallery, setGallery] = useState<Loan | null>(null)
  useEffect(() => { setSearch(q) }, [q])

  const query = searchParams.toString()
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams(query)
      if (!params.get('status')) params.set('status', 'OUT')
      const [list, open] = await Promise.all([api<ListResponse>(`/api/inventory/loans?${params.toString()}`), api<ListResponse>('/api/inventory/loans?status=OUT&page=1')])
      setData(list); setOpenLoans(open.loans)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [query])
  useEffect(() => { void load() }, [load])
  useEffect(() => { api<CustomerOption[]>('/api/customers').then(setCustomers).catch(() => setCustomers([])) }, [])

  const navigate = (change: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString()); params.delete('page'); change(params)
    const next = params.toString(); router.push(`${pathname}${next ? `?${next}` : ''}`)
  }
  const setFilter = (key: string, value: string) => navigate(params => { if (value) params.set(key, value); else params.delete(key) })
  const hasFilters = !!(customer || technician || q || (status && status !== 'OUT'))

  const customerOptions = useMemo(() => customers.map(c => ({ id: c.id, label: c.businessName || c.name || c.email || 'Cliente', description: [c.businessName && c.businessName !== c.name ? c.name : '', c.taxId, c.email].filter(Boolean).join(' · ') || undefined })), [customers])
  const technicianOptions = useMemo(() => (data?.technicians || []).map(t => ({ id: t.id, label: t.name })), [data])
  const productOptions = useMemo(() => (data?.products || []).map(p => ({ id: p.id, label: p.name, description: p.stock > 0 ? `${p.stock} disponible${p.stock === 1 ? '' : 's'}` : 'Sin existencias' })), [data])
  const openLoanOptions = useMemo(() => openLoans.map(loan => ({ id: loan.id, label: `${loan.numberLabel} · ${customerLabel(loan.customer)} · ${loan.itemsLabel}`, description: `${loan.technician.name} · hace ${loan.ageLabel}` })), [openLoans])
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1

  function startOut() {
    setAttempted(false)
    const me = session?.user?.id || ''
    setOutDraft({ items: [newLine()], customerId: '', technicianId: data?.technicians.some(t => t.id === me) ? me : '', notes: '', photos: [] })
  }
  function startReturn(loan?: Loan) { setAttempted(false); setReturnDraft({ loanId: loan?.id || '', notes: '', photos: [] }) }
  function patchLine(key: string, change: Partial<OutLine>) { if (outDraft) setOutDraft({ ...outDraft, items: outDraft.items.map(line => line.key === key ? { ...line, ...change } : line) }) }
  function removeLine(key: string) { if (outDraft && outDraft.items.length > 1) setOutDraft({ ...outDraft, items: outDraft.items.filter(line => line.key !== key) }) }

  const lineErrors = (outDraft?.items || []).map((line, index, all) => ({
    product: !line.productId ? 'Selecciona el equipo.' : all.findIndex(other => other.productId === line.productId) !== index ? 'Este equipo ya está en otra línea: súmalo allí.' : '',
    quantity: !/^\d+$/.test(line.quantity) || Number(line.quantity) < 1 ? 'Cantidad entera mayor que cero.' : '',
  }))
  const outErrors = outDraft ? {
    items: lineErrors.some(line => line.product || line.quantity) ? 'Revisa los equipos de la salida.' : '',
    customer: !outDraft.customerId ? 'Selecciona el cliente.' : '',
    technician: !outDraft.technicianId ? 'Selecciona el técnico encargado.' : '',
  } : null
  const outValid = outErrors ? !Object.values(outErrors).some(Boolean) : false

  async function submitOut() {
    if (!outDraft) return
    setAttempted(true)
    if (!outValid) return
    setBusy(true)
    try {
      const loan = await api<Loan>('/api/inventory/loans', { method: 'POST', json: { items: outDraft.items.map(line => ({ productId: line.productId, quantity: Number(line.quantity) })), customerId: outDraft.customerId, technicianId: outDraft.technicianId, notes: outDraft.notes.trim(), photos: outDraft.photos } })
      toast.success(`Salida ${loan.numberLabel} registrada`)
      setOutDraft(null); await load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  async function submitReturn() {
    if (!returnDraft) return
    setAttempted(true)
    if (!returnDraft.loanId) return
    setBusy(true)
    try {
      const loan = await api<Loan>('/api/inventory/loans/return', { method: 'POST', json: { loanId: returnDraft.loanId, notes: returnDraft.notes.trim(), photos: returnDraft.photos } })
      toast.success(`Entrada de ${loan.numberLabel} registrada`)
      setReturnDraft(null); await load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const selectedReturn = openLoans.find(loan => loan.id === returnDraft?.loanId) || null

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-gray-900">Préstamos de equipos</h2><p className="text-sm text-gray-600">Salidas a clientes con uno o varios equipos y técnico encargado; la entrada siempre se registra sobre una salida y hereda sus datos.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || loading} onClick={() => startReturn()} title={openLoans.length ? 'Registrar la devolución de una salida' : 'No hay salidas en curso para devolver'}><ArrowDownToLine size={16} /> Entrada de equipo</Button>
        <Button disabled={busy || loading} onClick={startOut}><ArrowUpFromLine size={16} /> Salida de equipo</Button>
      </div>
    </div>

    <div className="mb-4 rounded-lg bg-white p-4 shadow">
      <form onSubmit={e => { e.preventDefault(); setFilter('q', search.trim()) }} className="mb-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número (PR-0001), equipo, cliente o técnico…" className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
      </form>
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <select aria-label="Estado" value={status} onChange={e => setFilter('status', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 md:w-auto">
          <option value="OUT">En préstamo</option><option value="RETURNED">Devueltos</option><option value="all">Todos</option>
        </select>
        <SearchSelect aria-label="Cliente" className="w-full md:w-64" placeholder="Buscar cliente…" emptyOption="Todos los clientes" value={customer} onChange={id => setFilter('customer', id)} options={customerOptions} />
        <SearchSelect aria-label="Técnico" className="w-full md:w-56" placeholder="Buscar técnico…" emptyOption="Todos los técnicos" value={technician} onChange={id => setFilter('technician', id)} options={technicianOptions} />
        {hasFilters && <button type="button" onClick={() => { setSearch(''); router.push(pathname) }} className="text-sm font-medium text-primary-600 hover:text-primary-700">Limpiar filtros</button>}
      </div>
    </div>

    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
    {loading && !data ? <div className="rounded-lg bg-white p-12 text-center text-gray-500 shadow">Cargando préstamos…</div>
      : !data || data.loans.length === 0 ? <div className="rounded-lg bg-white p-12 text-center shadow"><p className="text-lg text-gray-500">No hay préstamos{hasFilters ? ' con estos filtros' : status === 'OUT' ? ' en curso' : ''}</p><p className="mt-2 text-gray-400">Registra una salida de equipo para empezar.</p></div>
      : <div className={`overflow-hidden rounded-lg bg-white shadow ${loading ? 'opacity-60' : ''}`}>
        <div className="overflow-x-auto"><table className="w-full">
          <thead className="bg-gray-50"><tr>{['N.º', 'Equipo', 'Cliente', 'Técnico encargado', 'Salida', 'Devolución', 'Fotos', 'Acciones'].map(h => <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data.loans.map(loan => <tr key={loan.id} className="align-top hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-primary-600">{loan.numberLabel}</td>
              <td className="px-4 py-3 text-sm text-gray-900"><ul className="space-y-0.5">{loan.items.map(item => <li key={item.id}>{item.name} <span className="text-gray-500">× {item.quantity}</span></li>)}</ul>{loan.items.length > 1 && <div className="text-xs text-gray-500">{loan.items.length} equipos · {loan.units} unidades</div>}{loan.outNotes && <div className="text-xs text-gray-500 line-clamp-2" title={loan.outNotes}>{loan.outNotes}</div>}</td>
              <td className="px-4 py-3 text-sm"><div className="font-medium text-gray-900">{customerLabel(loan.customer)}</div>{loan.customer.businessName && loan.customer.businessName !== loan.customer.name && <div className="text-xs text-gray-500">{loan.customer.name}</div>}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{loan.technician.name}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{formatDateTimeCO(loan.outAt)}<div className={`text-xs ${loan.status === 'OUT' && loan.days >= 30 ? 'font-medium text-amber-700' : 'text-gray-500'}`}>{loan.status === 'OUT' ? `hace ${loan.ageLabel}` : `duró ${loan.ageLabel}`}</div></td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{loan.returnedAt ? <>{formatDateTimeCO(loan.returnedAt)}{loan.returnNotes && <div className="text-xs text-gray-500 line-clamp-2" title={loan.returnNotes}>{loan.returnNotes}</div>}</> : <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">En préstamo</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">{loan.outPhotos.length + loan.returnPhotos.length > 0 ? <button type="button" onClick={() => setGallery(loan)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-primary-600 hover:bg-primary-50"><Images size={16} /> {loan.outPhotos.length + loan.returnPhotos.length}</button> : <span className="text-gray-400">—</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">{loan.status === 'OUT' && <Button size="sm" variant="outline" disabled={busy} onClick={() => startReturn(loan)}><ArrowDownToLine size={14} /> Registrar entrada</Button>}</td>
            </tr>)}
          </tbody>
        </table></div>
      </div>}
    {data && <Pagination currentPage={page} totalPages={totalPages} totalCount={data.total} perPage={data.perPage} itemLabel="préstamos" />}

    <Dialog open={!!outDraft} onOpenChange={open => { if (!open && !busy) setOutDraft(null) }}><DialogContent>
      <DialogHeader><DialogTitle>Salida de equipo</DialogTitle><DialogDescription>Uno o varios equipos salen del inventario en préstamo a un cliente bajo la responsabilidad de un técnico. Todos se devuelven juntos en una sola entrada.</DialogDescription></DialogHeader>
      {outDraft && outErrors && <form onSubmit={e => { e.preventDefault(); void submitOut() }} className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="text-sm font-medium text-gray-700">Equipos <span className="text-red-500">*</span></span><Button type="button" size="sm" variant="outline" disabled={busy || outDraft.items.length >= 50} onClick={() => setOutDraft({ ...outDraft, items: [...outDraft.items, newLine()] })}><Plus size={14} /> Agregar equipo</Button></div>
          <div className="space-y-2">{outDraft.items.map((line, index) => <div key={line.key} className="rounded-lg border border-gray-200 p-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <SearchSelect aria-label={`Equipo ${index + 1}`} placeholder="Buscar producto del catálogo…" value={line.productId} onChange={id => patchLine(line.key, { productId: id })} options={productOptions} invalid={attempted && !!lineErrors[index]?.product} disabled={busy} />
                {attempted && lineErrors[index]?.product && <p role="alert" className="mt-1 text-xs text-red-700">{lineErrors[index].product}</p>}
              </div>
              <div className="w-24 shrink-0">
                <Input aria-label={`Cantidad del equipo ${index + 1}`} type="number" inputMode="numeric" min={1} step={1} value={line.quantity} disabled={busy} onChange={e => patchLine(line.key, { quantity: e.target.value })} className="text-sm" aria-invalid={attempted && !!lineErrors[index]?.quantity} />
                {attempted && lineErrors[index]?.quantity && <p role="alert" className="mt-1 text-xs text-red-700">{lineErrors[index].quantity}</p>}
              </div>
              <button type="button" disabled={busy || outDraft.items.length <= 1} onClick={() => removeLine(line.key)} aria-label={`Quitar equipo ${index + 1}`} title={outDraft.items.length <= 1 ? 'La salida necesita al menos un equipo' : 'Quitar esta línea'} className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={16} /></button>
            </div>
          </div>)}</div>
          <p className="mt-1 text-xs text-gray-500">{outDraft.items.length} equipo{outDraft.items.length === 1 ? '' : 's'} · {outDraft.items.reduce((sum, line) => sum + (/^\d+$/.test(line.quantity) ? Number(line.quantity) : 0), 0)} unidades. Cada línea es un producto distinto; usa la cantidad para repetir el mismo equipo.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Cliente <span className="text-red-500">*</span></label>
            <SearchSelect aria-label="Cliente" placeholder="Buscar cliente…" value={outDraft.customerId} onChange={id => setOutDraft({ ...outDraft, customerId: id })} options={customerOptions} invalid={attempted && !!outErrors.customer} disabled={busy} />
            {attempted && outErrors.customer && <p role="alert" className="mt-1 text-xs text-red-700">{outErrors.customer}</p>}</div>
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Técnico encargado <span className="text-red-500">*</span></label>
            <SearchSelect aria-label="Técnico encargado" placeholder="Buscar técnico…" value={outDraft.technicianId} onChange={id => setOutDraft({ ...outDraft, technicianId: id })} options={technicianOptions} invalid={attempted && !!outErrors.technician} disabled={busy} />
            {attempted && outErrors.technician && <p role="alert" className="mt-1 text-xs text-red-700">{outErrors.technician}</p>}</div>
        </div>
        <div><label htmlFor="loan-notes" className="mb-1 block text-sm font-medium text-gray-700">Observaciones</label>
          <Textarea id="loan-notes" rows={3} maxLength={1000} value={outDraft.notes} disabled={busy} onChange={e => setOutDraft({ ...outDraft, notes: e.target.value })} placeholder="Estado del equipo, accesorios entregados, serial…" className={inputClass} /></div>
        <PhotoUpload label="Fotos de salida" value={outDraft.photos} onChange={photos => setOutDraft({ ...outDraft, photos })} disabled={busy} />
        <div className="flex flex-wrap justify-end gap-2 pt-2"><Button variant="outline" disabled={busy} onClick={() => setOutDraft(null)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? <><Loader2 size={16} className="animate-spin" /> Registrando…</> : <><ArrowUpFromLine size={16} /> Registrar salida</>}</Button></div>
      </form>}
    </DialogContent></Dialog>

    <Dialog open={!!returnDraft} onOpenChange={open => { if (!open && !busy) setReturnDraft(null) }}><DialogContent>
      <DialogHeader><DialogTitle>Entrada de equipo</DialogTitle><DialogDescription>Toda entrada se registra sobre una orden de salida en curso: los equipos, las cantidades, el cliente y el técnico se toman de ella y todos vuelven al inventario.</DialogDescription></DialogHeader>
      {returnDraft && <form onSubmit={e => { e.preventDefault(); void submitReturn() }} className="space-y-4">
        <div><label className="mb-1 block text-sm font-medium text-gray-700">Orden de salida <span className="text-red-500">*</span></label>
          {openLoanOptions.length ? <SearchSelect aria-label="Orden de salida" placeholder="Buscar por número, cliente o equipo…" value={returnDraft.loanId} onChange={id => setReturnDraft({ ...returnDraft, loanId: id })} options={openLoanOptions} invalid={attempted && !returnDraft.loanId} disabled={busy} /> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No hay salidas en curso. Una entrada no puede registrarse sin una salida previa: primero registra la salida del equipo.</p>}
          {attempted && !returnDraft.loanId && <p role="alert" className="mt-1 text-xs text-red-700">Selecciona la orden de salida que se devuelve; la entrada no puede registrarse sin ella.</p>}</div>
        {selectedReturn && <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2"><dt className="text-gray-500">Equipos que regresan ({selectedReturn.units} unidades)</dt><dd><ul className="font-medium text-gray-900">{selectedReturn.items.map(item => <li key={item.id}>{item.name} × {item.quantity}</li>)}</ul></dd></div>
          <div><dt className="text-gray-500">Cliente</dt><dd className="font-medium text-gray-900">{customerLabel(selectedReturn.customer)}</dd></div>
          <div><dt className="text-gray-500">Técnico encargado</dt><dd className="font-medium text-gray-900">{selectedReturn.technician.name}</dd></div>
          <div><dt className="text-gray-500">Salida</dt><dd className="font-medium text-gray-900">{formatDateTimeCO(selectedReturn.outAt)} <span className="text-gray-500">(hace {selectedReturn.ageLabel})</span></dd></div>
          {selectedReturn.outNotes && <div className="sm:col-span-2"><dt className="text-gray-500">Observaciones de salida</dt><dd className="text-gray-900">{selectedReturn.outNotes}</dd></div>}
          {selectedReturn.outPhotos.length > 0 && <div className="sm:col-span-2"><dt className="mb-1 text-gray-500">Fotos de salida</dt><dd className="flex flex-wrap gap-2">{selectedReturn.outPhotos.map(url => <a key={url} href={url} target="_blank" rel="noopener" className="block h-16 w-16 overflow-hidden rounded-lg border border-gray-200"><img src={url} alt="Foto de salida" className="h-full w-full object-cover" /></a>)}</dd></div>}
        </dl>}
        <div><label htmlFor="return-notes" className="mb-1 block text-sm font-medium text-gray-700">Observaciones de la devolución</label>
          <Textarea id="return-notes" rows={3} maxLength={1000} value={returnDraft.notes} disabled={busy} onChange={e => setReturnDraft({ ...returnDraft, notes: e.target.value })} placeholder="Estado en que regresa, faltantes, daños…" className={inputClass} /></div>
        <PhotoUpload label="Fotos de entrada" value={returnDraft.photos} onChange={photos => setReturnDraft({ ...returnDraft, photos })} disabled={busy} />
        <div className="flex flex-wrap justify-end gap-2 pt-2"><Button variant="outline" disabled={busy} onClick={() => setReturnDraft(null)}>Cancelar</Button><Button type="submit" disabled={busy || !openLoanOptions.length}>{busy ? <><Loader2 size={16} className="animate-spin" /> Registrando…</> : <><ArrowDownToLine size={16} /> Registrar entrada</>}</Button></div>
      </form>}
    </DialogContent></Dialog>

    <Dialog open={!!gallery} onOpenChange={open => { if (!open) setGallery(null) }}><DialogContent>
      <DialogHeader><DialogTitle>Fotos de {gallery?.numberLabel}</DialogTitle><DialogDescription>{gallery ? `${gallery.itemsLabel} · ${customerLabel(gallery.customer)}` : ''}</DialogDescription></DialogHeader>
      {gallery && [['Salida', gallery.outPhotos, gallery.outAt], ['Entrada', gallery.returnPhotos, gallery.returnedAt]].map(([title, photos, at]) => (photos as string[]).length > 0 && <section key={title as string} className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">{title as string} <span className="font-normal text-gray-500">· {formatDateTimeCO(at as string)}</span></h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{(photos as string[]).map(url => <a key={url} href={url} target="_blank" rel="noopener" className="block aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50"><img src={url} alt={`Foto de ${title}`} className="h-full w-full object-cover" /></a>)}</div>
      </section>)}
    </DialogContent></Dialog>
  </>
}
