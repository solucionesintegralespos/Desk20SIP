'use client'

import { useId, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export default function TechnicianPicker({ agents, value, onChange, disabled = false, label: title = 'Técnicos asignados', required = true, locked = [] }: {
  agents: Array<{ id: string; name: string | null; email?: string | null }>
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  label?: string
  required?: boolean
  /** Technicians that stay selected, e.g. the person responsible for an order. */
  locked?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const label = (agent: typeof agents[number]) => agent.name || agent.email || 'Técnico'
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const selected = agents.filter(agent => value.includes(agent.id))
  const summary = selected.map(label).join(', ')
  const matches = agents.filter(agent => normalize(`${label(agent)} ${agent.email || ''}`).includes(normalize(query.trim())))
  const close = () => { setOpen(false); setQuery('') }

  return <fieldset disabled={disabled} className="min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close()
  }} onKeyDown={event => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus() }
  }}>
    <legend id={`${id}-label`} className="mb-2 text-sm font-medium text-gray-700">{title}{required && <span className="text-red-600" aria-hidden="true"> *</span>}</legend>
    <button ref={trigger} type="button" aria-labelledby={`${id}-label ${id}-summary`}
      aria-expanded={open} aria-controls={`${id}-options`}
      onClick={() => { if (open) close(); else setOpen(true) }}
      className="flex w-full items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50">
      <span id={`${id}-summary`} className="min-w-0 flex-1 truncate" title={summary}>
        {summary || 'Seleccionar técnicos…'}
      </span>
      {value.length > 0 && <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{value.length}</span>}
      <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id={`${id}-options`} className="mt-2 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
      <div className="relative border-b p-2">
        <Search aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input autoFocus type="search" aria-label="Buscar técnico por nombre o correo" placeholder="Buscar técnico…"
          value={query} onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') event.preventDefault() }}
          className="w-full rounded-md border border-gray-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>
      <div className="max-h-44 overflow-y-auto p-1">
        {/* The whole row toggles the technician. Keeping focus on mousedown stops the
            blur handler from closing the list before the click on the name arrives. */}
        {matches.map(agent => <label key={agent.id} onMouseDown={event => event.preventDefault()} className={`flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-50 ${value.includes(agent.id) ? 'bg-primary-50' : ''}`}>
          <input type="checkbox" checked={value.includes(agent.id)} disabled={locked.includes(agent.id)}
            onChange={event => onChange(event.target.checked ? [...value, agent.id] : value.filter(id => id !== agent.id))} />
          <span className="min-w-0 break-words">{label(agent)}</span>
        </label>)}
        {!matches.length && <p className="p-3 text-sm text-gray-500">{agents.length ? 'No se encontraron técnicos.' : 'No hay técnicos disponibles.'}</p>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <span className="text-xs text-gray-500" aria-live="polite">{value.length} seleccionados</span>
        <button type="button" onClick={() => { close(); trigger.current?.focus() }} className="rounded px-2 py-1 text-sm font-medium text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500">Listo</button>
      </div>
    </div>}
  </fieldset>
}
