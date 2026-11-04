'use client'
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'

/**
 * Live document preview. `build` renders the PDF with the same engine used for the
 * download and the email, so what the user sees is exactly what will be sent.
 * `deps` triggers a debounced re-render; `src` shows an already generated PDF instead.
 */
export function PdfPreview({ build, deps = [], src, title = 'Vista previa del documento', className = '' }: {
  build?: () => Promise<Uint8Array>
  deps?: unknown[]
  src?: string
  title?: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(src || null)
  const [rendering, setRendering] = useState(!!build)
  const [error, setError] = useState('')
  const previous = useRef<string | null>(null)
  const key = JSON.stringify(deps)

  useEffect(() => {
    if (src) { setUrl(src); setRendering(false); return }
    if (!build) return
    let cancelled = false
    setRendering(true)
    const timer = setTimeout(async () => {
      try {
        const bytes = await build()
        if (cancelled) return
        const next = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        if (previous.current) URL.revokeObjectURL(previous.current)
        previous.current = next
        setUrl(next); setError('')
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'No se pudo generar la vista previa')
      } finally { if (!cancelled) setRendering(false) }
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, src])
  useEffect(() => () => { if (previous.current) URL.revokeObjectURL(previous.current) }, [])

  return <div className={`relative flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-100 ${className}`}>
    <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
      <span className="font-medium">{title}</span>
      <span className="flex items-center gap-2">
        {rendering && <span className="flex items-center gap-1 text-primary-600" role="status"><Loader2 size={14} className="animate-spin" /> Actualizando…</span>}
        {url && <a href={url} target="_blank" rel="noopener" className="flex items-center gap-1 text-primary-600 hover:underline"><ExternalLink size={14} /> Abrir en pestaña nueva</a>}
      </span>
    </div>
    {error ? <p role="alert" className="p-4 text-sm text-red-700">{error}</p>
      : url ? <iframe title={title} src={`${url}#toolbar=0&navpanes=0`} className="h-[70vh] min-h-[420px] w-full flex-1 bg-white" />
      : <p className="p-4 text-sm text-gray-500">Generando vista previa…</p>}
  </div>
}
