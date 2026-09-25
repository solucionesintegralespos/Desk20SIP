'use client';
import { createContext, useContext, useEffect, useId, useRef } from 'react';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Button as DeskButton } from '@/components/ui/Button';
export function Button({ size, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    children: ReactNode;
    variant?: 'outline' | 'ghost';
    size?: 'sm' | 'icon';
}) {
    return <DeskButton type="button" {...props} size={size === 'icon' ? 'sm' : size} className={'gap-2 ' + (props.className || '')}/>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={'w-full rounded-lg border border-gray-300 p-2 ' + (props.className || '')}/>; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={'w-full rounded-lg border border-gray-300 p-2 ' + (props.className || '')}/>; }
export function Progress({ value }: {
    value: number;
}) { return <progress aria-label="Avance del checklist" max={100} value={value} className="w-full"/>; }
const DialogContext = createContext({ close: () => { }, title: '' });
export function Dialog({ open, onOpenChange, children }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
}) { const title = useId(); return open ? <DialogContext.Provider value={{ close: () => onOpenChange(false), title }}>{children}</DialogContext.Provider> : null; }
export function DialogContent({ children, className }: {
    children: ReactNode;
    className?: string;
}) {
    const { close, title } = useContext(DialogContext);
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close(); }, []);
    return <dialog ref={ref} aria-labelledby={title} onCancel={e => { e.preventDefault(); close(); }} className={'service-dialog rounded-xl p-6 w-[calc(100%-2rem)] max-w-2xl backdrop:bg-black/40 ' + (className || '')}><button type="button" aria-label="Cerrar" onClick={close} className="float-right px-3 py-1">✕</button>{children}</dialog>;
}
export function DialogHeader({ children }: {
    children: ReactNode;
}) { return <div className="mb-6">{children}</div>; }
export function DialogTitle({ children }: {
    children: ReactNode;
}) { const { title } = useContext(DialogContext); return <h2 id={title} className="text-xl font-semibold">{children}</h2>; }
export function DialogDescription({ children }: {
    children: ReactNode;
}) { return <p className="text-sm text-gray-500 mt-2">{children}</p>; }
