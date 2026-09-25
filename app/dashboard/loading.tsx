export default function Loading() {
  return <div role="status" aria-label="Cargando sección" className="p-4 md:p-8 animate-pulse">
    <span className="sr-only">Cargando sección…</span>
    <div className="h-8 w-52 rounded bg-primary-100 mb-3" />
    <div className="h-4 w-72 max-w-full rounded bg-gray-200 mb-8" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {[0,1,2].map(i=><div key={i} className="h-28 bg-white rounded-xl border border-primary-100" />)}
    </div>
    <div className="h-64 bg-white rounded-xl border border-primary-100" />
  </div>
}
