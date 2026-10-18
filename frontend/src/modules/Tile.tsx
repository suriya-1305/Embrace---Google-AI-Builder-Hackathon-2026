import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import type { ModuleDef } from './registry';

/** A bento tile. Tapping empty space opens the module; buttons inside still work. */
export function Tile({ def, children, title, icon }: { def: Pick<ModuleDef, 'id' | 'hue' | 'size' | 'route' | 'title' | 'icon'>; children: ReactNode; title?: string; icon?: IconName }) {
  const nav = useNavigate();
  const go = (e: React.MouseEvent) => {
    if (!def.route) return;
    if ((e.target as HTMLElement).closest('button, a, input, label, select, textarea')) return;
    nav(def.route);
  };
  return (
    <section className={`tile tile--${def.size} hue-${def.hue}`} data-link={!!def.route} onClick={go} aria-label={title ?? def.title}>
      <div className="tile__head">
        <span className="tile__icon"><Icon name={icon ?? def.icon} /></span>
        <span className="tile__title">{title ?? def.title}</span>
        {def.route && <Link to={def.route} className="tile__open" aria-label={`Open ${title ?? def.title}`}><Icon name="back" /></Link>}
      </div>
      <div className="tile__body">{children}</div>
    </section>
  );
}

export function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[];
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p.v)); const min = Math.min(...pts.map((p) => p.v));
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * 100;
  const y = (v: number) => 38 - ((v - min) / Math.max(0.0001, max - min)) * 32;
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${x(pts[pts.length - 1].i)},44 L${x(pts[0].i)},44 Z`} fill="currentColor" opacity="0.14" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
