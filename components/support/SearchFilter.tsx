'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export type SearchOption = { id: string; label: string; description?: string };
export type SearchValue = { query: string; id: string };
export const searchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

export function SearchFilter({ label, placeholder, options, value, onChange }: {
  label: string;
  placeholder: string;
  options: SearchOption[];
  value: SearchValue;
  onChange: (value: SearchValue) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [id, open, active]);
  const matches = value.id ? options : options.filter(option => searchText(`${option.label} ${option.description || ''}`).includes(searchText(value.query)));
  function select(option: SearchOption) {
    onChange({ query: option.label, id: option.id });
    setOpen(false); setActive(-1);
  }
  return <div className="relative min-w-0" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
    <div className="relative">
      <input id={id} ref={input} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
        aria-activedescendant={open && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined}
        autoComplete="off" placeholder={placeholder} value={value.query}
        className="w-full border border-gray-300 rounded-lg py-2 pl-3 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        onFocus={() => { setOpen(true); setActive(-1); }}
        onChange={event => { onChange({ query: event.target.value, id: '' }); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, matches.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, index - 1)); }
          if (event.key === 'Escape') { setOpen(false); setActive(-1); }
          if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); select(matches[active]); }
        }} />
      <div className="absolute right-2 top-0 h-full flex items-center gap-1">
        {value.query && <button type="button" aria-label={`Limpiar ${label.toLowerCase()}`} className="p-1 text-slate-500" onClick={() => { onChange({ query: '', id: '' }); setActive(-1); input.current?.focus(); }}><X size={14} /></button>}
        <button type="button" aria-label={`Mostrar opciones de ${label.toLowerCase()}`} aria-expanded={open} className="p-1 text-slate-500" onMouseDown={event => event.preventDefault()} onClick={() => { input.current?.focus(); setOpen(!open); setActive(-1); }}><ChevronDown size={16} /></button>
      </div>
    </div>
    {open && <ul id={`${id}-options`} role="listbox" aria-label={label} className="absolute z-20 mt-1 max-h-60 overflow-y-auto w-full rounded-lg border border-slate-200 bg-white shadow-lg py-1">
      <li role="presentation"><button type="button" role="option" aria-selected={!value.query} className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50" onMouseDown={event => event.preventDefault()} onClick={() => { onChange({ query: '', id: '' }); setOpen(false); setActive(-1); }}>Todos</button></li>
      {matches.map((option, index) => <li key={option.id} role="presentation">
        <button id={`${id}-option-${index}`} type="button" role="option" aria-selected={value.id === option.id}
          className={`w-full text-left px-3 py-2 text-sm ${active === index || value.id === option.id ? 'bg-primary-50' : 'hover:bg-slate-50'}`}
          onMouseDown={event => event.preventDefault()} onClick={() => select(option)}>
          <span className="block break-words font-medium">{option.label}</span>
          {option.description && <span className="block break-words text-xs text-slate-500">{option.description}</span>}
        </button>
      </li>)}
      {!matches.length && <li role="presentation" className="px-3 py-3 text-sm text-slate-500">No se encontraron coincidencias</li>}
    </ul>}
  </div>;
}
