'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { searchText, type SearchOption } from '@/components/support/SearchFilter'

export const byLabel = (a: SearchOption, b: SearchOption) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base', numeric: true })

// Required single choice with type-ahead search; options are shown alphabetically.
export function SearchSelect({ options, value, onChange, placeholder = 'Buscar…', emptyOption, disabled, invalid, id: inputId, 'aria-label': ariaLabel, className = '' }: {
  options: SearchOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** Adds a first option that clears the selection, e.g. "Sin cliente". */
  emptyOption?: string
  disabled?: boolean
  invalid?: boolean
  id?: string
  'aria-label'?: string
  className?: string
}) {
  const generated = useId()
  const id = inputId || generated
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const sorted = useMemo(() => [...options].sort(byLabel), [options])
  const selected = sorted.find(option => option.id === value)
  const matches = useMemo(() => {
    const term = searchText(query)
    const found = term ? sorted.filter(option => searchText(`${option.label} ${option.description || ''}`).includes(term)) : sorted
    return emptyOption && !term ? [{ id: '', label: emptyOption }, ...found] : found
  }, [sorted, query, emptyOption])
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [id, open, active])

  function close() { setOpen(false); setQuery(''); setActive(-1) }
  function choose(option: SearchOption) { onChange(option.id); close() }

  // Forms often wrap this in a <label>; clicks inside the list call preventDefault so the label
  // does not forward them to the input and reopen the list.
  return <div className={`relative min-w-0 ${className}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
    <input id={id} ref={input} role="combobox" aria-label={ariaLabel} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
      aria-activedescendant={open && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined}
      autoComplete="off" disabled={disabled} aria-invalid={invalid || undefined}
      // While searching the box is empty and the current choice stays visible as the placeholder.
      value={open ? query : selected?.label || (value === '' && emptyOption ? emptyOption : '')}
      placeholder={open ? selected?.label || placeholder : placeholder}
      className="w-full px-4 py-2 pr-9 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      onFocus={() => { setOpen(true); setQuery(''); setActive(-1) }}
      onClick={() => setOpen(true)}
      onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, matches.length - 1)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)) }
        if (event.key === 'Escape') { event.preventDefault(); close() }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (matches[active]) choose(matches[active]) }
      }} />
    <button type="button" tabIndex={-1} aria-hidden="true" disabled={disabled} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500"
      onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); if (open) close(); else input.current?.focus() }}><ChevronDown size={16} /></button>
    {open && <ul id={`${id}-options`} role="listbox" aria-label={ariaLabel} className="absolute z-30 mt-1 max-h-64 overflow-y-auto w-full rounded-lg border border-gray-200 bg-white shadow-lg py-1">
      {matches.map((option, index) => <li key={option.id || 'empty'} id={`${id}-option-${index}`} role="option" aria-selected={option.id === value}
        className={`cursor-pointer px-3 py-2 text-sm ${active === index ? 'bg-primary-50' : option.id === value ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
        onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); choose(option) }} onMouseEnter={() => setActive(index)}>
        <span className={`block break-words ${option.id ? 'font-medium text-gray-900' : 'text-gray-500'}`}>{option.label}</span>
        {option.description && <span className="block break-words text-xs text-gray-500">{option.description}</span>}
      </li>)}
      {!matches.length && <li role="presentation" className="px-3 py-3 text-sm text-gray-500">No se encontraron coincidencias</li>}
    </ul>}
  </div>
}
