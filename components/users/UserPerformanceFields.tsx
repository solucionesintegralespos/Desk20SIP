'use client'
import { useState } from 'react'

export type PerformanceFields = { avatar: string; dailyEntryGoal: number | null; dailyClosureGoal: number | null }
export default function UserPerformanceFields({ value, onChange, disabled, onUploading }: {
  value: PerformanceFields; onChange: (patch: Partial<PerformanceFields>) => void; disabled: boolean; onUploading: (busy: boolean) => void
}) {
  const [error, setError] = useState('')
  async function upload(file?: File) {
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Selecciona una foto JPG, PNG o WebP de hasta 2 MB.'); return
    }
    onUploading(true)
    try {
      const data = new FormData(); data.append('file', file); data.append('purpose', 'avatar')
      const response = await fetch('/api/upload', { method: 'POST', body: data })
      const result = await response.json()
      if (!response.ok) throw Error(result.error || 'No se pudo subir la foto')
      onChange({ avatar: result.url })
    } catch (e) { setError((e as Error).message) } finally { onUploading(false) }
  }
  return <fieldset disabled={disabled} className="space-y-4 rounded-lg border border-gray-200 p-4">
    <legend className="px-1 text-sm font-medium text-gray-700">Foto y metas mensuales</legend>
    <div className="flex flex-wrap items-center gap-3">
      {value.avatar && <img src={value.avatar} alt="Foto del usuario" className="h-16 w-16 rounded-full object-cover" />}
      <label className="min-w-0 flex-1 text-sm text-gray-700">Foto de perfil
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} className="mt-1 block w-full text-sm" />
        <span className="text-xs text-gray-500">JPG, PNG o WebP · Máximo 2 MB</span>
      </label>
      {value.avatar && <button type="button" className="text-sm text-red-600" onClick={() => onChange({ avatar: '' })}>Quitar foto</button>}
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {(['dailyEntryGoal', 'dailyClosureGoal'] as const).map(key => <label key={key} className="text-sm font-medium text-gray-700">
        {key === 'dailyEntryGoal' ? 'Meta de digitación' : 'Meta de cierres'}
        <input type="number" min="1" max="100000" step="1" placeholder="Sin meta" value={value[key] ?? ''}
          onChange={event => onChange({ [key]: event.target.value === '' ? null : Number(event.target.value) })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        <span className="mt-1 block text-xs font-normal text-gray-500">Tickets por mes</span>
      </label>)}
    </div>
    <p className="text-xs text-gray-500">Deja una meta vacía para no calificarla. El cumplimiento se calcula por usuario y por mes calendario, en hora de Colombia.</p>
  </fieldset>
}
