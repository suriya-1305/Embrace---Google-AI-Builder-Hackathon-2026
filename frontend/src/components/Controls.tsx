import type { ReactNode } from 'react';

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/** 1-5 or 0-10 picker with an explicit "prefer not to answer". */
export function Scale({ label, value, onChange, min = 1, max = 5, low, high, skipped, onSkip }: {
  label: string; value: number | null | undefined; onChange: (v: number) => void; min?: number; max?: number; low: string; high: string; skipped?: boolean; onSkip?: () => void;
}) {
  const vals = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field__label row row--between" style={{ width: '100%' }}>
        <span>{label}</span>
        {onSkip && <button type="button" className="link-btn" aria-pressed={!!skipped} onClick={onSkip}>{skipped ? 'Skipped' : 'Prefer not to answer'}</button>}
      </legend>
      <div className={`scale ${vals.length > 5 ? 'scale--11' : ''}`} style={{ opacity: skipped ? 0.45 : 1 }}>
        {vals.map((v) => <button key={v} type="button" aria-pressed={!skipped && value === v} aria-label={`${label}: ${v}`} onClick={() => onChange(v)}>{v}</button>)}
      </div>
      <div className="scale-ends"><span>{low}</span><span>{high}</span></div>
    </fieldset>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <p className="faint" role="status">{label}…</p>;
}
