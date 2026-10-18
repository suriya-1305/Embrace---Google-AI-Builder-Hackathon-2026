// One editor for logging, correcting and confirming voice drafts. Fields filled
// by the model are marked so the caregiver checks them before saving.
import { useEffect, useState } from 'react';
import type { BabyEvent, EventInput, EventType, Provenance } from '../../types';
import { Field, Segmented } from '../../components/Controls';
import { fromInputValue, localIso, toInputValue } from '../../lib/time';
import { useSession } from '../../state/session';
import { logDraftKey, readLogDraft, saveLogDraft } from '../../state/logDrafts';

type Draft = EventInput & { id?: string };
const TITLE: Record<EventType, string> = { feeding: 'Feeding', sleep: 'Sleep', diaper: 'Diaper' };

export function newDraft(type: EventType): Draft {
  const now = localIso();
  if (type === 'feeding') return { type, startedAt: now, endedAt: null, details: { method: 'bottle', amountMl: null, side: null }, note: null, source: 'manual' };
  if (type === 'sleep') return { type, startedAt: now, endedAt: null, details: {}, note: null, source: 'manual' };
  return { type, startedAt: now, endedAt: null, details: { kind: 'wet' }, note: null, source: 'manual' };
}

function Prov({ field, prov }: { field: string; prov?: Provenance }) {
  if (!prov) return null;
  if (prov.modelInferred.includes(field) || (field === 'startedAt' && prov.modelInferred.includes('date'))) return <span className="badge badge--assumed">Assumed, please check</span>;
  const said = prov.userStated.includes(field) || (field === 'startedAt' && prov.userStated.includes('startTimeLocal'));
  if (said) return <span className="badge badge--ok">You said this</span>;
  return null;
}

export function EventEditor({ initial, onSave, onDelete, saving, saveLabel = 'Save' }: {
  initial: Draft | BabyEvent; onSave: (d: Draft) => void; onDelete?: () => void; saving?: boolean; saveLabel?: string;
}) {
  const { session } = useSession();
  const key = !initial.id && initial.source === 'manual' && session?.infantId ? logDraftKey(session.uid, session.infantId, initial.type) : null;
  const [restored] = useState(() => !!key && !!readLogDraft(key));
  const [d, setD] = useState<Draft>(() => {
    const value = (key ? readLogDraft(key) : null) ?? initial;
    return { ...value, details: { ...value.details } };
  });
  useEffect(() => { if (key) saveLogDraft(key, d); }, [key, d]);
  const det = d.details as Record<string, unknown>;
  const setDet = (k: string, v: unknown) => setD({ ...d, details: { ...det, [k]: v } });
  const sleepEnvironment = (det.sleepEnvironment ?? {}) as Record<string, string>;
  const setSleepEnvironment = (key: string, value: string) => setDet('sleepEnvironment', { ...sleepEnvironment, [key]: value });
  const prov = d.provenance;
  const method = String(det.method ?? 'bottle');

  return (
    <form className="stack stack--lg" onSubmit={(e) => { e.preventDefault(); onSave(d); }}>
      <h2 className="title">{TITLE[d.type]}</h2>
      {restored && <span className="badge" role="status">Unfinished log restored</span>}
      {d.type === 'feeding' && (
        <>
          <Field label="How">
            <Segmented label="Feeding method" value={method} onChange={(v) => setDet('method', v)}
              options={[{ value: 'breast', label: 'Breast' }, { value: 'bottle', label: 'Bottle' }, { value: 'formula', label: 'Formula' }, { value: 'expressed', label: 'Expressed' }]} />
          </Field>
          {method === 'breast' ? (
            <Field label="Side">
              <Segmented label="Side" value={String(det.side ?? 'left')} onChange={(v) => setDet('side', v)}
                options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }]} />
            </Field>
          ) : (
            <Field label="Amount (ml)" htmlFor="amt" hint="Leave empty if you're not sure.">
              <div className="row"><input id="amt" className="input" inputMode="numeric" value={det.amountMl == null ? '' : String(det.amountMl)}
                onChange={(e) => setDet('amountMl', e.target.value === '' ? null : Number(e.target.value))} /><Prov field="amountMl" prov={prov} /></div>
            </Field>
          )}
        </>
      )}
      {d.type === 'diaper' && (
        <Field label="What kind">
          <div className="row"><Segmented label="Diaper" value={String(det.kind ?? 'wet')} onChange={(v) => setDet('kind', v)}
            options={[{ value: 'wet', label: 'Wet' }, { value: 'dirty', label: 'Dirty' }, { value: 'both', label: 'Both' }, { value: 'dry', label: 'Dry' }]} /></div>
          <Prov field="diaperKind" prov={prov} />
        </Field>
      )}
      <Field label={d.type === 'sleep' ? 'Fell asleep' : 'When'} htmlFor="start">
        <input id="start" type="datetime-local" className="input" value={toInputValue(d.startedAt)} onChange={(e) => setD({ ...d, startedAt: fromInputValue(e.target.value) })} />
        <Prov field="startedAt" prov={prov} />
      </Field>
      {d.type === 'sleep' && (
        <>
          <Field label="Woke up" htmlFor="end">
            <input id="end" type="datetime-local" className="input" value={d.endedAt ? toInputValue(d.endedAt) : ''} onChange={(e) => setD({ ...d, endedAt: e.target.value ? fromInputValue(e.target.value) : null })} />
            <Prov field="durationMin" prov={prov} />
          </Field>
          <fieldset className="field">
            <legend className="field__label">Sleep environment (optional)</legend>
            <div className="stack">
              <label className="field"><span className="field__label">Position placed down</span><select className="select" value={sleepEnvironment.position ?? ''} onChange={(e) => setSleepEnvironment('position', e.target.value)}><option value="">Not recorded</option><option value="back">Back</option><option value="side">Side</option><option value="front">Front</option></select></label>
              <label className="field"><span className="field__label">Sleep surface</span><select className="select" value={sleepEnvironment.surface ?? ''} onChange={(e) => setSleepEnvironment('surface', e.target.value)}><option value="">Not recorded</option><option value="crib_bassinet_play_yard">Crib, bassinet or play yard</option><option value="adult_bed">Adult bed</option><option value="sofa_chair">Sofa or armchair</option><option value="other">Other</option></select></label>
              <label className="field"><span className="field__label">Loose bedding or soft objects</span><select className="select" value={sleepEnvironment.softItems ?? ''} onChange={(e) => setSleepEnvironment('softItems', e.target.value)}><option value="">Not recorded</option><option value="none">None</option><option value="present">Present</option></select></label>
              <label className="field"><span className="field__label">Sleep space</span><select className="select" value={sleepEnvironment.roomSharing ?? ''} onChange={(e) => setSleepEnvironment('roomSharing', e.target.value)}><option value="">Not recorded</option><option value="same_room_separate_surface">Same room, separate surface</option><option value="separate_room">Separate room</option><option value="bed_sharing">Bed-sharing</option></select></label>
            </div>
          </fieldset>
          <aside className="callout" role="note">
            <strong>Safe-sleep reminder:</strong> place baby on their back for every sleep, use a firm, flat, separate sleep surface, and keep loose bedding and soft objects out. Room-share without bed-sharing. Follow any individualized advice from your clinician. <a href="https://www.cdc.gov/sudden-infant-death/sleep-safely/index.html" target="_blank" rel="noreferrer">CDC guidance</a> · <a href="https://www.healthychildren.org/English/ages-stages/baby/sleep/Pages/a-parents-guide-to-safe-sleep.aspx" target="_blank" rel="noreferrer">AAP guidance</a>. General guidance; clinical review pending.
          </aside>
        </>
      )}
      <Field label="Note (optional)" htmlFor="note">
        <input id="note" className="input" maxLength={500} value={d.note ?? ''} onChange={(e) => setD({ ...d, note: e.target.value || null })} />
      </Field>
      <div className="row wrap">
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving' : saveLabel}</button>
        {onDelete && <button className="btn btn--ghost" type="button" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  );
}
