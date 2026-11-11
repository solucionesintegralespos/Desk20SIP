'use client'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/components/accounting/api'
import { MoneyInput } from '@/components/accounting/MoneyInput'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/support/ui'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { inputClass, type StockProduct } from './types'

export type ManualMovementType = 'PURCHASE' | 'ENTRY' | 'WRITE_OFF' | 'COUNT'
const typeOptions: Array<{ value: ManualMovementType; label: string; help: string }> = [
  { value: 'PURCHASE', label: 'Compra', help: 'Unidades compradas a un proveedor; suman al inventario y registran el costo.' },
  { value: 'ENTRY', label: 'Entrada', help: 'Otras entradas (devoluciones, traslados, ajustes a favor); suman al inventario.' },
  { value: 'WRITE_OFF', label: 'Baja', help: 'Unidades dañadas, perdidas o retiradas; restan del inventario.' },
  { value: 'COUNT', label: 'Conteo', help: 'Conteo físico: escribe las unidades encontradas; el sistema registra la diferencia.' },
]

export function MovementDialog({ open, onClose, onSaved, products, product, type: presetType, allowWriteOff = true }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  products: StockProduct[]
  /** Fixed product when opened from a row; otherwise the user picks one. */
  product?: StockProduct | null
  type?: ManualMovementType
  /** Write-offs (bajas) are a per-user permission; without it the option is not offered. */
  allowWriteOff?: boolean
}) {
  const availableTypes = allowWriteOff ? typeOptions : typeOptions.filter(option => option.value !== 'WRITE_OFF')
  const [productId, setProductId] = useState(product?.id || '')
  const [type, setType] = useState<ManualMovementType>(presetType || 'PURCHASE')
  const [quantity, setQuantity] = useState('')
  const [unitCostCents, setUnitCostCents] = useState<number | null>(null)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    if (!open) return
    setProductId(product?.id || ''); setType(presetType || 'PURCHASE'); setQuantity(''); setUnitCostCents(null); setReference(''); setNotes(''); setAttempted(false)
  }, [open, product?.id, presetType])

  const selected = products.find(p => p.id === productId) || null
  const options = useMemo(() => products.filter(p => p.active || p.id === productId).map(p => ({ id: p.id, label: p.name, description: `${p.stock} en bodega${p.description ? ` · ${p.description}` : ''}` })), [products, productId])
  const qty = Number(quantity)
  const validQty = /^\d+$/.test(quantity.trim()) && Number.isSafeInteger(qty) && (type === 'COUNT' ? qty >= 0 : qty > 0)
  const resulting = selected && validQty ? (type === 'COUNT' ? qty : type === 'WRITE_OFF' ? selected.stock - qty : selected.stock + qty) : null
  const errors = {
    product: !productId ? 'Selecciona el producto.' : '',
    quantity: !validQty ? (type === 'COUNT' ? 'Escribe las unidades encontradas (entero, 0 o más).' : 'Escribe una cantidad entera mayor que cero.') : resulting !== null && resulting < 0 ? `No hay existencias suficientes: hay ${selected?.stock}.` : '',
  }
  const showCost = type === 'PURCHASE' || type === 'ENTRY'

  async function submit() {
    setAttempted(true)
    if (errors.product || errors.quantity || saving) return
    setSaving(true)
    try {
      const result = await api<{ stock: number; previousStock: number }>('/api/inventory/movements', { method: 'POST', json: {
        productId, type, quantity: qty, unitCost: showCost && unitCostCents != null ? unitCostCents / 100 : null, reference: reference.trim(), notes: notes.trim(),
      } })
      toast.success(`${typeOptions.find(t => t.value === type)?.label} registrada: ${selected?.name} pasa de ${result.previousStock} a ${result.stock} unidades`)
      onSaved(); onClose()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={value => { if (!value && !saving) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Registrar movimiento de inventario</DialogTitle>
        <DialogDescription>{typeOptions.find(t => t.value === type)?.help}</DialogDescription>
      </DialogHeader>
      <form onSubmit={e => { e.preventDefault(); void submit() }} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Producto <span className="text-red-500">*</span></label>
          {product ? <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm"><span className="font-medium text-gray-900">{product.name}</span> <span className="text-gray-500">· {product.stock} en bodega</span></p>
            : <SearchSelect aria-label="Producto" placeholder="Buscar producto…" value={productId} onChange={setProductId} options={options} invalid={attempted && !!errors.product} />}
          {attempted && errors.product && <p role="alert" className="mt-1 text-xs text-red-700">{errors.product}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">Tipo de movimiento
            <select value={type} onChange={e => setType(e.target.value as ManualMovementType)} className={`${inputClass} mt-1`}>
              {availableTypes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">{type === 'COUNT' ? 'Unidades encontradas' : 'Cantidad'} <span className="text-red-500">*</span>
            <input type="number" inputMode="numeric" min={type === 'COUNT' ? 0 : 1} step={1} value={quantity} onChange={e => setQuantity(e.target.value)} aria-invalid={attempted && !!errors.quantity} className={`${inputClass} mt-1 text-right tabular-nums`} placeholder="0" />
            {attempted && errors.quantity && <span role="alert" className="mt-1 block text-xs font-normal text-red-700">{errors.quantity}</span>}
          </label>
        </div>
        {showCost && <label className="block text-sm font-medium text-gray-700">Costo unitario (opcional)
          <MoneyInput aria-label="Costo unitario" valueCents={unitCostCents} onChange={setUnitCostCents} className="mt-1 text-sm" placeholder="0" />
        </label>}
        <label className="block text-sm font-medium text-gray-700">Referencia <span className="font-normal text-gray-500">(factura, proveedor, acta…)</span>
          <input type="text" maxLength={200} value={reference} onChange={e => setReference(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="block text-sm font-medium text-gray-700">Notas
          <textarea rows={2} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        {selected && <dl className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 text-sm">
          <div><dt className="text-gray-500">Existencias actuales</dt><dd className="font-semibold tabular-nums">{selected.stock}</dd></div>
          <div><dt className="text-gray-500">Existencias resultantes</dt><dd className={`font-semibold tabular-nums ${resulting !== null && resulting < 0 ? 'text-red-700' : 'text-gray-900'}`}>{resulting === null ? '—' : resulting}{type === 'COUNT' && resulting !== null && <span className="ml-1 text-xs font-normal text-gray-500">(ajuste {resulting - selected.stock >= 0 ? '+' : ''}{resulting - selected.stock})</span>}</dd></div>
        </dl>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {saving ? 'Guardando…' : 'Registrar'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
