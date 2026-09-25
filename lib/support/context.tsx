'use client';
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { dailyRange } from '@/lib/daily-filter';
import type { State, User } from './model';
import { usePathname } from 'next/navigation';
import { clientId } from './client-id';
type Collection = 'orders' | 'checklists' | 'templates';
export interface SaveResult {
    id: string;
    email?: { status: 'pending' | 'sent' | 'failed' | 'skipped'; recipient: string | null; message: string };
}
interface AppContext {
    state: State;
    user: User;
    dateFrom: string;
    dateTo: string;
    setDates: (from: string, to: string) => void;
    loading: boolean;
    save: <K extends Collection>(collection: K, record: State[K][number]) => Promise<SaveResult>;
    detail: <K extends Collection>(collection: K, id: string) => Promise<State[K][number]>;
}
const Context = createContext<AppContext>(null!);
export const useSupport = () => useContext(Context);
export const uid = clientId;
export const number = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${uid().slice(0, 4).toUpperCase()}`;
export function SupportProvider({ children }: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const scope = pathname.startsWith('/dashboard/settings') ? 'templates' : pathname.startsWith('/dashboard/orders') ? 'orders' : 'checklists';
    const [data, setData] = useState<{
        state: State;
        user: User;
    } | null>(null);
    const [error, setError] = useState('');
    const [dates, setDatesState] = useState(() => ({ scope, ...dailyRange() }));
    const range = dates.scope === scope ? dates : dailyRange();
    const { dateFrom, dateTo } = range;
    const [loading, setLoading] = useState(false);
    const requestId = useRef(0);
    function setDates(from: string, to: string) { setDatesState({ scope, ...dailyRange(from, to) }); }
    async function refresh() {
        const id = ++requestId.current;
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ scope, dateFrom, dateTo });
            const response = await fetch(`/api/service?${params}`, { cache: 'no-store' });
            const result = await response.json();
            if (!response.ok) throw Error(result.error);
            if (id === requestId.current) setData(result);
        } catch (e) {
            if (id === requestId.current) setError((e as Error).message);
        } finally { if (id === requestId.current) setLoading(false); }
    }
    useEffect(() => { void refresh(); return () => { requestId.current++; }; }, [scope, dateFrom, dateTo]);
    async function detail<K extends Collection>(collection: K, id: string): Promise<State[K][number]> {
        const response = await fetch(`/api/service/${collection}/${encodeURIComponent(id)}`,{cache:'no-store'});
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        return result;
    }
    async function save<K extends Collection>(collection: K, record: State[K][number]): Promise<SaveResult> { const response = await fetch(`/api/service/${collection}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) }); const result = await response.json(); if (!response.ok)
        throw Error(result.error); await refresh(); return result; }
    if (error)
        return <p role="alert" className="p-6 text-red-600">{error} <button onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Reintentar</button></p>;
    if (!data)
        return <p className="p-6">Cargando procesos…</p>;
    return <Context.Provider value={{ ...data, save, detail, dateFrom, dateTo, setDates, loading }}>{children}</Context.Provider>;
}
