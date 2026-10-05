import type { ReactNode } from 'react';
export function Field({ label, children, required, error }: {
    label: string;
    children: ReactNode;
    required?: boolean;
    /** Shown under the control once the form was submitted with this field missing. */
    error?: string;
}) { return <label className="field"><span>{label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}</span>{children}{error && <span className="field-error" role="alert">{error}</span>}</label>; }
export function Pick({ label, value, onChange, options }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: {
        value: string;
        label: string;
    }[];
}) { return <select aria-label={label} className="w-full rounded-lg border p-2" value={value} onChange={e => onChange(e.target.value)}><option value="" disabled>Seleccionar {label.toLowerCase()}</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>; }
export function Check({ checked, onChange, label, disabled = false, error }: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    disabled?: boolean;
    error?: string;
}) { return <div><label className={`flex items-start gap-3 text-sm ${error ? 'check-invalid' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} aria-invalid={!!error || undefined} onChange={e => onChange(e.target.checked)}/><span>{label}</span></label>{error && <p className="field-error mt-1" role="alert">{error}</p>}</div>; }
