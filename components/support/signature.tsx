'use client';
import { useEffect, useRef } from 'react';
import { Button } from './ui';
export function Signature({ value, onChange, disabled, error }: {
    value?: string;
    onChange: (data: string) => void;
    disabled: boolean;
    error?: string;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const moved = useRef(false);
    useEffect(() => { if (!value || disabled || !canvas.current)
        return; const img = new Image(); img.onload = () => { if (canvas.current && !drawing.current)
        canvas.current.getContext('2d')?.drawImage(img, 0, 0, 800, 260); }; img.src = value; }, [disabled, value]);
    if (disabled)
        return value ? <img src={value} alt="Firma de aceptación del cliente" className="max-h-40"/> : null;
    return <div><p className="mb-2 text-sm">Firma del cliente<span className="text-red-600" aria-hidden="true"> *</span> · dibuja con el dedo o el mouse</p><canvas aria-label="Área para dibujar la firma" aria-invalid={!!error || undefined} tabIndex={-1} ref={canvas} width={800} height={260} className="signature w-full border rounded-lg bg-white touch-none" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; moved.current = false; const r = e.currentTarget.getBoundingClientRect(); const c = e.currentTarget.getContext('2d')!; c.beginPath(); c.moveTo((e.clientX - r.left) * 800 / r.width, (e.clientY - r.top) * 260 / r.height); }} onPointerMove={e => { if (!drawing.current)
        return; const r = e.currentTarget.getBoundingClientRect(); const c = e.currentTarget.getContext('2d')!; c.strokeStyle = '#132642'; c.lineWidth = 3; c.lineCap = 'round'; c.lineTo((e.clientX - r.left) * 800 / r.width, (e.clientY - r.top) * 260 / r.height); c.stroke(); moved.current = true; }} onPointerUp={() => { drawing.current = false; if (moved.current)
        onChange(canvas.current!.toDataURL('image/png')); }} onPointerCancel={() => { drawing.current = false; }}/><Button type="button" variant="ghost" size="sm" onClick={() => { canvas.current?.getContext('2d')?.clearRect(0, 0, 800, 260); onChange(''); }}>Borrar firma</Button>{error && <p className="field-error" role="alert">{error}</p>}</div>;
}
