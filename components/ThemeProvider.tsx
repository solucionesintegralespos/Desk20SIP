'use client';
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
// Device preference: each browser keeps its own choice and it is never sent to the server.
const STORAGE_KEY = 'sip-theme';
// Runs while the HTML is parsed, before the workspace paints, so a stored dark theme never flashes light.
const applyStoredTheme = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark'||t==='light')document.currentScript.parentElement.setAttribute('data-theme',t)}catch(e){}})()`;
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
function storedTheme(): Theme | null {
  try { const value = localStorage.getItem(STORAGE_KEY); return value === 'dark' || value === 'light' ? value : null; }
  catch { return null; }
}
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  // The server cannot read the device preference: render light, then adopt the stored value before paint.
  const [theme, setTheme] = useState<Theme>('light');
  useClientLayoutEffect(() => {
    const stored = storedTheme();
    if (stored) setTheme(stored);
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === STORAGE_KEY) setTheme(event.newValue === 'dark' ? 'dark' : 'light'); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage disabled: the choice lasts for this page only. */ }
  }
  return <ThemeContext.Provider value={{ theme, toggle }}><div data-theme={theme} className="h-full" suppressHydrationWarning><script dangerouslySetInnerHTML={{ __html: applyStoredTheme }} />{children}</div></ThemeContext.Provider>;
}
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const context = useContext(ThemeContext);
  if (!context) return null;
  const { theme, toggle } = context;
  if (compact) return <div><button type="button" onClick={toggle} aria-pressed={theme === 'dark'} aria-label="Tema oscuro" title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} className="p-3 rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-500">{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button></div>;
  return <button type="button" onClick={toggle} aria-pressed={theme === 'dark'} title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg border-l-4 border-transparent text-sm font-medium text-left text-primary-100 hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-white"><Moon size={18} className="shrink-0" /><span className="truncate">Tema oscuro</span><span aria-hidden="true" className={`ml-auto shrink-0 h-4 w-7 rounded-full p-0.5 transition-colors ${theme === 'dark' ? 'bg-brand-amber' : 'bg-white/25'}`}><span className={`block h-3 w-3 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-3' : ''}`} /></span></button>;
}
