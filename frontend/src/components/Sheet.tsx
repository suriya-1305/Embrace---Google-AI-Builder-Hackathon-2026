import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({ title, onClose, children, dismissible = true }: { title: string; onClose: () => void; children: ReactNode; dismissible?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const content = ref.current?.querySelector('.sheet__content');
    (content?.querySelector<HTMLElement>('input, textarea, select') ?? content?.querySelector<HTMLElement>('button'))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && latest.current.dismissible) latest.current.onClose();
      if (event.key !== 'Tab') return;
      const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') ?? []).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; if (prev?.isConnected) prev.focus(); };
  }, []);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet__grip" />
        <div className="sheet__toolbar"><span className="small muted">{title}</span><button className="icon-btn" type="button" disabled={!dismissible} onClick={onClose} aria-label={`Close ${title}`} title="Close"><Icon name="x" /></button></div>
        <div className="stack stack--lg sheet__content">{children}</div>
      </div>
    </div>
  );
}
