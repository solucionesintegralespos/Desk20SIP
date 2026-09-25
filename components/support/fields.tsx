import type { ReactNode } from 'react';
export function Field({ label, children }: {
    label: string;
    children: ReactNode;
}) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Pick({ label, value, onChange, options }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: {
        value: string;
        label: string;
    }[];
}) { return <select aria-label={label} className="w-full rounded-lg border p-2" value={value} onChange={e => onChange(e.target.value)}><option value="" disabled>Seleccionar {label.toLowerCase()}</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>; }
export function Check({ checked, onChange, label, disabled = false }: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    disabled?: boolean;
}) { return <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}/><span>{label}</span></label>; }
