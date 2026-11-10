'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Percent, Plus, Pencil, Power, Search, Star } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Textarea } from '@/components/support/ui'
import { api } from './api'
import { formatMoney, formatNumber, toCents } from '@/lib/accounting/format'
import { MoneyInput } from './MoneyInput'
import { ProductImport } from './ProductImport'

type Product = { id: string; name: string; description: string | null; price: number; active: boolean; loanable?: boolean; createdAt: string; updatedAt: string }
type Tax = { id: string; name: string; rate: number; active: boolean; isDefault: boolean }
type Tab = 'products' | 'taxes'

type ProductDraft = { id?: string; name: string; description: string; priceCents: number | null; loanable: boolean }
type TaxDraft = { id?: string; name: string; rate: string; isDefault: boolean }

const fieldClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500'
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').trim()
const StatusPill = ({ active }: { active: boolean }) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{active ? 'Activo' : 'Inactivo'}</span>

export default function Catalog() {
  const [tab, setTab] = useState<Tab>('products')
  const [products, setProducts] = useState<Product[]>([])
  const [taxes, setTaxes] = useState<Tax[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null)
  const [taxDraft, setTaxDraft] = useState<TaxDraft | null>(null)
  const [attempted, setAttempted] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [productList, taxList] = await Promise.all([api<Product[]>('/api/products'), api<Tax[]>('/api/taxes')])
      setProducts(productList); setTaxes(taxList)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const filteredProducts = useMemo(() => { const q = normalize(query); return q ? products.filter(p => normalize(`${p.name} ${p.description || ''}`).includes(q)) : products }, [products, query])
  const filteredTaxes = useMemo(() => { const q = normalize(query); return q ? taxes.filter(t => normalize(t.name).includes(q)) : taxes }, [taxes, query])

  // ---- Products -------------------------------------------------------------
  const productErrors = (draft: ProductDraft) => {
    const errors: Partial<Record<keyof ProductDraft, string>> = {}
    if (!draft.name.trim()) errors.name = 'El nombre es obligatorio.'
    else if (draft.name.trim().length > 200) errors.name = 'Máximo 200 caracteres.'
    if (draft.description.length > 1000) errors.description = 'Máximo 1000 caracteres.'
    if (draft.priceCents == null) errors.priceCents = 'Indica el precio sugerido.'
    else if (draft.priceCents < 0) errors.priceCents = 'El precio no puede ser negativo.'
    return errors
  }
  async function saveProduct(draft: ProductDraft) {
    setAttempted(true)
    if (Object.keys(productErrors(draft)).length) return
    setBusy(true)
    try {
      const body = { name: draft.name.trim(), description: draft.description.trim(), price: (draft.priceCents ?? 0) / 100, loanable: draft.loanable }
      if (draft.id) await api(`/api/products/${draft.id}`, { method: 'PATCH', json: body })
      else await api('/api/products', { method: 'POST', json: body })
      toast.success(draft.id ? 'Producto actualizado' : 'Producto creado')
      setProductDraft(null); setAttempted(false)
      await refresh()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  async function toggleProduct(product: Product) {
    if (product.active && !window.confirm(`¿Desactivar "${product.name}"? Dejará de ofrecerse en nuevas cotizaciones; las anteriores conservan su información.`)) return
    setBusy(true)
    try {
      await api(`/api/products/${product.id}`, { method: 'PATCH', json: { active: !product.active } })
      toast.success(product.active ? 'Producto desactivado' : 'Producto activado')
      await refresh()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  // ---- Taxes ----------------------------------------------------------------
  const taxErrors = (draft: TaxDraft) => {
    const errors: Partial<Record<keyof TaxDraft, string>> = {}
    if (!draft.name.trim()) errors.name = 'El nombre es obligatorio.'
    else if (draft.name.trim().length > 100) errors.name = 'Máximo 100 caracteres.'
    const rate = Number(draft.rate.replace(',', '.'))
    if (draft.rate.trim() === '' || !Number.isFinite(rate)) errors.rate = 'Indica el porcentaje.'
    else if (rate < 0 || rate > 100) errors.rate = 'Debe estar entre 0 y 100.'
    return errors
  }
  async function saveTax(draft: TaxDraft) {
    setAttempted(true)
    if (Object.keys(taxErrors(draft)).length) return
    setBusy(true)
    try {
      const body = { name: draft.name.trim(), rate: Math.round(Number(draft.rate.replace(',', '.')) * 10000) / 10000, isDefault: draft.isDefault }
      if (draft.id) await api(`/api/taxes/${draft.id}`, { method: 'PATCH', json: body })
      else await api('/api/taxes', { method: 'POST', json: body })
      toast.success(draft.id ? 'Impuesto actualizado' : 'Impuesto creado')
      setTaxDraft(null); setAttempted(false)
      await refresh()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  async function toggleTax(tax: Tax) {
    if (tax.active && !window.confirm(`¿Desactivar "${tax.name}"? No estará disponible en nuevas cotizaciones; las existentes conservan su valor.`)) return
    setBusy(true)
    try {
      await api(`/api/taxes/${tax.id}`, { method: 'PATCH', json: { active: !tax.active } })
      toast.success(tax.active ? 'Impuesto desactivado' : 'Impuesto activado')
      await refresh()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  const pErrors = productDraft && attempted ? productErrors(productDraft) : {}
  const tErrors = taxDraft && attempted ? taxErrors(taxDraft) : {}
  const tabClass = (value: Tab) => `flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${tab === value ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`

  return <>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Catálogo</h1>
        <p className="mt-1 text-gray-600">Productos e impuestos disponibles para las cotizaciones</p>
      </div>
      {tab === 'products'
        ? <div className="flex flex-wrap items-center gap-2"><ProductImport disabled={busy || loading} onImported={() => { void refresh() }} /><Button disabled={busy || loading} onClick={() => { setAttempted(false); setProductDraft({ name: '', description: '', priceCents: null, loanable: false }) }}><Plus size={16} /> Nuevo producto</Button></div>
        : <Button disabled={busy || loading} onClick={() => { setAttempted(false); setTaxDraft({ name: '', rate: '', isDefault: false }) }}><Plus size={16} /> Nuevo impuesto</Button>}
    </div>

    <div className="rounded-lg bg-white shadow">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-4 pt-2 md:flex-row md:items-end md:justify-between">
        <div role="tablist" aria-label="Secciones del catálogo" className="flex gap-1">
          <button type="button" role="tab" aria-selected={tab === 'products'} aria-controls="catalog-products" id="tab-products" className={tabClass('products')} onClick={() => { setTab('products'); setQuery('') }}><Package size={16} /> Productos <span className="rounded-full bg-gray-100 px-2 text-xs text-gray-600">{products.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'taxes'} aria-controls="catalog-taxes" id="tab-taxes" className={tabClass('taxes')} onClick={() => { setTab('taxes'); setQuery('') }}><Percent size={16} /> Impuestos <span className="rounded-full bg-gray-100 px-2 text-xs text-gray-600">{taxes.length}</span></button>
        </div>
        <div className="relative pb-2 md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" aria-label={tab === 'products' ? 'Buscar producto' : 'Buscar impuesto'} placeholder={tab === 'products' ? 'Buscar producto…' : 'Buscar impuesto…'} value={query} onChange={e => setQuery(e.target.value)} className={`${fieldClass} pl-9`} />
        </div>
      </div>

      {error && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error} <button type="button" className="ml-2 font-medium underline" onClick={() => void refresh()}>Reintentar</button></p>}
      {loading && !error && <p className="p-6 text-sm text-gray-500">Cargando catálogo…</p>}

      {!loading && !error && tab === 'products' && <div id="catalog-products" role="tabpanel" aria-labelledby="tab-products">
        <p className="px-4 pt-3 text-xs text-gray-500">Los productos no se eliminan: desactívalos para ocultarlos de nuevas cotizaciones; las cotizaciones anteriores conservan su información.</p>
        {filteredProducts.length === 0
          ? <div className="p-10 text-center"><p className="text-gray-600">{products.length ? 'No hay productos que coincidan con la búsqueda.' : 'Aún no hay productos.'}</p>{!products.length && <p className="mt-1 text-sm text-gray-500">Crea el primero con «Nuevo producto».</p>}</div>
          : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3 text-right">Precio sugerido</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-gray-200">{filteredProducts.map(product => <tr key={product.id} className={product.active ? '' : 'text-gray-500'}>
              <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
              <td className="max-w-md px-4 py-3 text-gray-600"><span className="line-clamp-2">{product.description || '—'}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatMoney(toCents(product.price))}</td>
              <td className="px-4 py-3"><span className="flex flex-wrap items-center gap-1"><StatusPill active={product.active} />{product.loanable && <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">Préstamo</span>}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-right"><div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setAttempted(false); setProductDraft({ id: product.id, name: product.name, description: product.description || '', priceCents: toCents(product.price), loanable: !!product.loanable }) }} aria-label={`Editar ${product.name}`}><Pencil size={14} /> Editar</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleProduct(product)} aria-label={`${product.active ? 'Desactivar' : 'Activar'} ${product.name}`}><Power size={14} /> {product.active ? 'Desactivar' : 'Activar'}</Button>
              </div></td>
            </tr>)}</tbody>
          </table></div>}
      </div>}

      {!loading && !error && tab === 'taxes' && <div id="catalog-taxes" role="tabpanel" aria-labelledby="tab-taxes">
        <p className="px-4 pt-3 text-xs text-gray-500">El impuesto por defecto queda seleccionado al crear una cotización; puede cambiarse o quitarse en cada una. Los impuestos no se eliminan: desactívalos.</p>
        {filteredTaxes.length === 0
          ? <div className="p-10 text-center"><p className="text-gray-600">{taxes.length ? 'No hay impuestos que coincidan con la búsqueda.' : 'Aún no hay impuestos.'}</p></div>
          : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Impuesto</th><th className="px-4 py-3 text-right">Porcentaje</th><th className="px-4 py-3">Por defecto</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-gray-200">{filteredTaxes.map(tax => <tr key={tax.id} className={tax.active ? '' : 'text-gray-500'}>
              <td className="px-4 py-3 font-medium text-gray-900">{tax.name}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatNumber(tax.rate, 4)} %</td>
              <td className="px-4 py-3">{tax.isDefault ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Star size={14} /> Por defecto</span> : <span className="text-xs text-gray-400">—</span>}</td>
              <td className="px-4 py-3"><StatusPill active={tax.active} /></td>
              <td className="whitespace-nowrap px-4 py-3 text-right"><div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setAttempted(false); setTaxDraft({ id: tax.id, name: tax.name, rate: String(tax.rate), isDefault: tax.isDefault }) }} aria-label={`Editar ${tax.name}`}><Pencil size={14} /> Editar</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleTax(tax)} aria-label={`${tax.active ? 'Desactivar' : 'Activar'} ${tax.name}`}><Power size={14} /> {tax.active ? 'Desactivar' : 'Activar'}</Button>
              </div></td>
            </tr>)}</tbody>
          </table></div>}
      </div>}
    </div>

    <Dialog open={!!productDraft} onOpenChange={open => { if (!open) { setProductDraft(null); setAttempted(false) } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{productDraft?.id ? 'Editar producto' : 'Nuevo producto'}</DialogTitle></DialogHeader>
        {productDraft && <form noValidate onSubmit={e => { e.preventDefault(); void saveProduct(productDraft) }} className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">Nombre <span className="text-red-600" aria-hidden="true">*</span>
            <Input autoFocus required maxLength={200} value={productDraft.name} aria-invalid={!!pErrors.name || undefined} onChange={e => setProductDraft({ ...productDraft, name: e.target.value })} className="mt-1 text-sm" />
            {pErrors.name && <span role="alert" className="mt-1 block text-xs font-medium text-red-700">{pErrors.name}</span>}
          </label>
          <label className="block text-sm font-medium text-gray-700">Descripción
            <Textarea rows={3} maxLength={1000} value={productDraft.description} aria-invalid={!!pErrors.description || undefined} onChange={e => setProductDraft({ ...productDraft, description: e.target.value })} className="mt-1 text-sm" placeholder="Detalle que aparecerá en la cotización (opcional)" />
            {pErrors.description && <span role="alert" className="mt-1 block text-xs font-medium text-red-700">{pErrors.description}</span>}
          </label>
          <label className="block text-sm font-medium text-gray-700">Precio sugerido (COP) <span className="text-red-600" aria-hidden="true">*</span>
            <MoneyInput required valueCents={productDraft.priceCents} invalid={!!pErrors.priceCents} onChange={cents => setProductDraft({ ...productDraft, priceCents: cents })} className="mt-1 text-sm" placeholder="0" />
            {pErrors.priceCents && <span role="alert" className="mt-1 block text-xs font-medium text-red-700">{pErrors.priceCents}</span>}
            <span className="mt-1 block text-xs font-normal text-gray-500">Se carga al elegir el producto en una cotización y puede ajustarse allí sin modificar el catálogo.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={productDraft.loanable} onChange={e => setProductDraft({ ...productDraft, loanable: e.target.checked })} className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <span><span className="font-medium">Equipo de préstamo</span><span className="block text-xs text-gray-500">Solo los productos marcados aparecen en Inventario › Préstamos y en el reporte de Equipos.</span></span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={busy} onClick={() => { setProductDraft(null); setAttempted(false) }}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : productDraft.id ? 'Guardar cambios' : 'Crear producto'}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!taxDraft} onOpenChange={open => { if (!open) { setTaxDraft(null); setAttempted(false) } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{taxDraft?.id ? 'Editar impuesto' : 'Nuevo impuesto'}</DialogTitle></DialogHeader>
        {taxDraft && <form noValidate onSubmit={e => { e.preventDefault(); void saveTax(taxDraft) }} className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">Nombre <span className="text-red-600" aria-hidden="true">*</span>
            <Input autoFocus required maxLength={100} value={taxDraft.name} aria-invalid={!!tErrors.name || undefined} onChange={e => setTaxDraft({ ...taxDraft, name: e.target.value })} className="mt-1 text-sm" placeholder="IVA 19%" />
            {tErrors.name && <span role="alert" className="mt-1 block text-xs font-medium text-red-700">{tErrors.name}</span>}
          </label>
          <label className="block text-sm font-medium text-gray-700">Porcentaje (%) <span className="text-red-600" aria-hidden="true">*</span>
            <Input type="number" inputMode="decimal" min={0} max={100} step="0.0001" required value={taxDraft.rate} aria-invalid={!!tErrors.rate || undefined} onChange={e => setTaxDraft({ ...taxDraft, rate: e.target.value })} className="mt-1 text-sm" placeholder="19" />
            {tErrors.rate && <span role="alert" className="mt-1 block text-xs font-medium text-red-700">{tErrors.rate}</span>}
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={taxDraft.isDefault} onChange={e => setTaxDraft({ ...taxDraft, isDefault: e.target.checked })} />
            <span>Impuesto por defecto en nuevas cotizaciones<span className="block text-xs text-gray-500">Solo un impuesto puede ser el predeterminado; reemplaza al actual.</span></span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={busy} onClick={() => { setTaxDraft(null); setAttempted(false) }}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : taxDraft.id ? 'Guardar cambios' : 'Crear impuesto'}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </>
}
