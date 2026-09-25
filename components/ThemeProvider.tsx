'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void; saving: boolean; error: string } | null>(null);
export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    if (saving) return;
    const next = theme === 'light' ? 'dark' : 'light';
    setSaving(true); setError(''); setTheme(next);
    try {
      const response = await fetch('/api/preferences/theme', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: next }) });
      if (!response.ok) throw Error('No se pudo guardar el tema. Intenta nuevamente.');
    } catch (error) { setTheme(theme); setError((error as Error).message); }
    finally { setSaving(false); }
  }
  return <ThemeContext.Provider value={{ theme, toggle, saving, error }}><div data-theme={theme} className="h-full">{children}</div></ThemeContext.Provider>;
}
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const context = useContext(ThemeContext);
  if (!context) return null;
  const { theme, toggle, saving, error } = context;
  if (compact) return <div><button type="button" onClick={toggle} disabled={saving} aria-pressed={theme === 'dark'} aria-label="Tema oscuro" title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} className="p-3 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary-500">{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>{error && <span role="alert" title={error} className="block text-center text-red-600 text-xs">Error<span className="sr-only">: {error}</span></span>}</div>;
  return <div><button type="button" onClick={toggle} disabled={saving} aria-pressed={theme === 'dark'} aria-label="Tema oscuro" className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-primary-100 hover:bg-white/10 disabled:opacity-50">{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}<span>{saving ? 'Guardando tema…' : theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}</span></button>{error && <p role="alert" className="px-4 text-sm text-red-200">{error}</p>}</div>;
}
