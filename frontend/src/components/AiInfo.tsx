import { useId, useState } from 'react';

export function AiInfo() {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="ai-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="ai-info__button" aria-label="About this Emi draft" aria-expanded={open} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>i</button>
    {open && <span className="ai-info__tooltip" id={id} role="tooltip">Parsed by Emi, Embrace’s personalized AI assistant. Please review before saving.</span>}
  </span>;
}