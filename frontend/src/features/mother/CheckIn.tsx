import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../../state/session';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Field, Scale } from '../../components/Controls';
import type { CheckInInput } from '../../types';

type K = 'mood' | 'energy' | 'rest' | 'pain' | 'support';
const Q: { k: K; label: string; low: string; high: string; min?: number; max?: number }[] = [
  { k: 'mood', label: 'Mood', low: 'Very low', high: 'Very good' },
  { k: 'energy', label: 'Energy', low: 'Drained', high: 'Energetic' },
  { k: 'rest', label: 'Rest', low: 'None', high: 'Well rested' },
  { k: 'pain', label: 'Pain', low: 'No pain', high: 'Worst', min: 0, max: 10 },
  { k: 'support', label: 'Feeling supported', low: 'Not at all', high: 'Very' },
];

export function CheckIn() {
  const api = useApi();
  const toast = useToast();
  const nav = useNavigate();
  const [vals, setVals] = useState<Partial<Record<K, number>>>({});
  const [skipped, setSkipped] = useState<K[]>([]);
  const [note, setNote] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const input: CheckInInput = { ...Object.fromEntries(Q.map(({ k }) => [k, skipped.includes(k) ? null : vals[k] ?? null])), skipped, note: note || null };
    try {
      const r = await api.mother.createCheckin(input);
      toast('Check-in saved');
      if (r.prompt) setPrompt(r.prompt); else nav('/me');
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><h1 className="title">Daily check-in</h1><p className="lede">Answer what you like. Every question can be skipped.</p></div>
      {prompt ? (
        <Glass variant="glass--caution">
          <div className="stack">
            <p>{prompt}</p>
            <div className="row wrap"><Link className="btn" to="/me/recovery">Go to Recovery</Link><Link className="btn btn--ghost" to="/me">Not now</Link></div>
          </div>
        </Glass>
      ) : (
        <Glass>
          <div className="stack stack--lg">
            {Q.map((q) => (
              <Scale key={q.k} label={q.label} value={vals[q.k]} min={q.min} max={q.max} low={q.low} high={q.high} skipped={skipped.includes(q.k)}
                onChange={(v) => { setVals({ ...vals, [q.k]: v }); setSkipped(skipped.filter((s) => s !== q.k)); }}
                onSkip={() => setSkipped(skipped.includes(q.k) ? skipped.filter((s) => s !== q.k) : [...skipped, q.k])} />
            ))}
            <Field label="Anything else? (optional)" htmlFor="note"><textarea id="note" className="textarea" style={{ minHeight: 90 }} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <button className="btn btn--block" disabled={busy} onClick={save}>{busy ? 'Saving' : 'Save check-in'}</button>
          </div>
        </Glass>
      )}
    </>
  );
}
