export default function PerformanceCard({ month, name, avatar, entered, closed, entryGoal, closureGoal }: {
  month: string
  name: string; avatar: string | null; entered: number; closed: number; entryGoal: number | null; closureGoal: number | null
}) {
  const metrics = [
    { title: 'Digitación', count: entered, goal: entryGoal, color: '#6d28d9', description: 'Tickets registrados por ti este mes' },
    { title: 'Cierre de tickets', count: closed, goal: closureGoal, color: '#0284c7', description: 'Tickets cerrados por ti este mes' },
  ]
  return <section className="min-w-0 rounded-xl border border-primary-100 bg-white p-5 shadow-sm" aria-labelledby="performance-title">
    <div className="mb-4 flex items-center gap-3">
      {avatar && <img src={avatar} alt={name} className="h-12 w-12 rounded-full object-cover" />}
      <div><h2 id="performance-title" className="text-lg font-semibold text-gray-900">Mi rendimiento del mes</h2>
        <p className="text-sm text-gray-600">{name} · <span className="capitalize">{month}</span></p></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {metrics.map(metric => {
        const percent = metric.goal ? Math.round(metric.count / metric.goal * 100) : null
        return <div key={metric.title} className="flex min-w-0 flex-col items-center gap-3 py-3 text-center 2xl:flex-row 2xl:text-left">
          <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`${metric.title}: ${metric.count} tickets, ${metric.goal ? `meta ${metric.goal}, cumplimiento ${percent}%` : 'sin meta configurada'}`}>
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r="49" fill="none" stroke="#e5e7eb" strokeWidth="14" />
              <circle cx="60" cy="60" r="49" fill="none" stroke={metric.color} strokeWidth="14" pathLength="100" strokeDasharray={`${Math.min(percent || 0, 100)} 100`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{percent === null ? '—' : `${percent} %`}</span>
              <span className="text-xs text-gray-500">{percent === null ? 'Sin meta' : 'Cumplimiento'}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1"><h3 className="font-semibold text-gray-900">{metric.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{metric.description}</p>
            <p className="mt-2 text-sm text-gray-700"><strong>{metric.count}</strong> / {metric.goal ?? '—'} tickets</p>
            <p className="mt-1 text-xs text-gray-500">{metric.goal ? `${Math.max(0, metric.goal - metric.count)} para alcanzar tu meta` : 'El administrador puede asignar tu meta en Usuarios.'}</p>
          </div>
        </div>
      })}
    </div>
    <p className="mt-4 text-xs text-gray-500">Meta mensual · Actividad del mes calendario en hora de Colombia. Cumplimiento = tickets realizados ÷ meta × 100.</p>
  </section>
}
