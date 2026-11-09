'use client'
import { useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'

// Photo picker for loan exits and returns: uploads each image through /api/upload and keeps
// the returned URLs. Mobile browsers offer the camera through the image input.
const MAX_PHOTOS = 10
const MAX_BYTES = 15 * 1024 * 1024

export function PhotoUpload({ value, onChange, disabled, label = 'Fotos' }: { value: string[]; onChange: (urls: string[]) => void; disabled?: boolean; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    const room = MAX_PHOTOS - value.length
    const selected = Array.from(files).slice(0, Math.max(room, 0))
    if (files.length > room) toast.error(`Máximo ${MAX_PHOTOS} fotos`)
    const urls: string[] = []
    setUploading(selected.length)
    for (const file of selected) {
      try {
        if (!file.type.startsWith('image/')) throw new Error(`«${file.name}» no es una imagen`)
        if (file.size > MAX_BYTES) throw new Error(`«${file.name}» supera 15 MB`)
        const body = new FormData(); body.append('file', file)
        const response = await fetch('/api/upload', { method: 'POST', body })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No se pudo subir la foto')
        urls.push(data.url)
      } catch (error) { toast.error((error as Error).message) }
      finally { setUploading(count => count - 1) }
    }
    if (urls.length) onChange([...value, ...urls])
    if (input.current) input.current.value = ''
  }

  return <div>
    <div className="flex items-center justify-between gap-2 mb-1">
      <span className="text-sm font-medium text-gray-700">{label} <span className="text-gray-400 font-normal">({value.length}/{MAX_PHOTOS})</span></span>
      <button type="button" disabled={disabled || uploading > 0 || value.length >= MAX_PHOTOS} onClick={() => input.current?.click()}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
        {uploading > 0 ? <><Loader2 size={14} className="animate-spin" /> Subiendo {uploading}…</> : <><Camera size={14} /> Agregar fotos</>}
      </button>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" disabled={disabled} onChange={event => void upload(event.target.files)} />
    </div>
    {value.length ? <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {value.map(url => <li key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        <a href={url} target="_blank" rel="noopener"><img src={url} alt="Foto del equipo" className="h-full w-full object-cover" /></a>
        {!disabled && <button type="button" aria-label="Quitar foto" onClick={() => onChange(value.filter(item => item !== url))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-700 shadow hover:bg-red-50 hover:text-red-600"><X size={12} /></button>}
      </li>)}
    </ul> : <p className="text-xs text-gray-500">Sin fotos. Puedes tomar o adjuntar hasta {MAX_PHOTOS} imágenes.</p>}
  </div>
}
