import type { BabyEvent } from '../types';
import { Icon, type IconName } from './Icon';
import { timeOf } from '../lib/time';

const ICON: Record<string, IconName> = { feeding: 'bottle', sleep: 'sleep', diaper: 'drop' };

export function describeEvent(e: BabyEvent): { title: string; meta: string } {
  const d = e.details as Record<string, unknown>;
  if (e.type === 'feeding') {
    const method = d.method ? String(d.method).replace('breast', 'Breastfeed').replace('bottle', 'Bottle').replace('formula', 'Formula').replace('expressed', 'Expressed milk') : 'Feed';
    const amount = d.amountMl ? `, ${d.amountMl} ml` : '';
    const side = d.side ? `, ${d.side} side` : '';
    return { title: `${method}${amount}${side}`, meta: timeOf(e.startedAt) };
  }
  if (e.type === 'sleep') {
    const m = Number(d.durationMin ?? 0);
    return { title: m ? `Slept ${Math.floor(m / 60)} h ${m % 60} min` : 'Sleep started', meta: `${timeOf(e.startedAt)}${e.endedAt ? ` to ${timeOf(e.endedAt)}` : ''}` };
  }
  const kind = String(d.kind ?? '');
  return { title: kind === 'both' ? 'Wet and dirty diaper' : `${kind.charAt(0).toUpperCase()}${kind.slice(1)} diaper`, meta: timeOf(e.startedAt) };
}

export function EventRow({ event, onEdit }: { event: BabyEvent; onEdit?: (e: BabyEvent) => void }) {
  const { title, meta } = describeEvent(event);
  const assumed = (event.provenance?.modelInferred?.length ?? 0) > 0;
  return (
    <div className="item">
      <span className="item__icon"><Icon name={ICON[event.type]} /></span>
      <div className="item__body">
        <div className="item__title">{title}</div>
        <div className="item__meta">{meta}{event.source === 'voice' ? ', by voice' : ''}{event.syncStatus === 'pending' && <span className="badge badge--assumed" style={{ marginLeft: 6 }}>Pending sync</span>}{assumed && <span className="badge badge--assumed" style={{ marginLeft: 6 }}>Time assumed</span>}</div>
      </div>
      {onEdit && <button className="icon-btn" type="button" aria-label={`Edit ${title}`} onClick={() => onEdit(event)}><Icon name="edit" /></button>}
    </div>
  );
}
