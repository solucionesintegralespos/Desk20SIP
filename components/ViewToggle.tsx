'use client'
import { LayoutGrid, List } from 'lucide-react'
export type DirectoryView = 'cards' | 'list'
export default function ViewToggle({ value, onChange }: { value: DirectoryView; onChange: (value: DirectoryView) => void }) {
  return <div role="group" aria-label="Visualización" className="flex gap-1 shrink-0">
    {(['cards', 'list'] as const).map(view => <button key={view} type="button" aria-pressed={value === view}
      onClick={() => onChange(view)} className={`flex items-center gap-2 rounded-lg px-3 py-2 border text-sm ${value === view ? 'bg-primary-600 text-white' : 'bg-white text-gray-700'}`}>
      {view === 'cards' ? <LayoutGrid size={16} /> : <List size={16} />}{view === 'cards' ? 'Tarjetas' : 'Lista'}
    </button>)}
  </div>
}
