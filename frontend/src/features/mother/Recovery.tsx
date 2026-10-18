import { useState } from 'react';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Field, Loading, Scale, Segmented } from '../../components/Controls';
import { SafetyPanel } from '../../components/SafetyPanel';
import { motherQuestions } from '../../api/mock/logic';
import { dayOf, todayIso } from '../../lib/time';
import type { MotherWarningAnswers, RecoveryInput, SafetyResult, Symptom } from '../../types';

const SYMPTOMS: { v: Symptom; label: string }[] = [
  { v: 'incision_pain', label: 'Stitches or incision' }, { v: 'perineal_pain', label: 'Perineal pain' }, { v: 'bleeding', label: 'Bleeding' },
  { v: 'breast_pain', label: 'Breast pain' }, { v: 'headache', label: 'Headache' }, { v: 'swelling', label: 'Swelling' },
  { v: 'fever', label: 'Feeling feverish' }, { v: 'tiredness', label: 'Tiredness' }, { v: 'other', label: 'Something else' },
];

export function Recovery() {
  const api = useApi();
  const toast = useToast();
  const logs = useLoad(() => api.mother.listRecovery(), [api]);
  const [form, setForm] = useState<RecoveryInput>({ symptom: 'incision_pain', severity: 3, trend: 'better', onset: todayIso(), note: null });
  const [flags, setFlags] = useState<MotherWarningAnswers>({});
  const [temp, setTemp] = useState('');
  const [result, setResult] = useState<SafetyResult | null>(null);
  const booleans = motherQuestions.filter((q) => q.type === 'boolean');

  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><h1 className="title">Recovery</h1><p className="lede">Your body did something huge. Keep a note of how it's healing, so changes are easy to spot and share.</p></div>

      <Glass>
        <div className="stack stack--lg">
          <h2 className="subtitle">Check warning signs</h2>
          <div className="chips">
            {booleans.map((q) => {
              const on = !!flags[q.field as keyof MotherWarningAnswers];
              const label = q.field === 'thoughtsOfHarm' ? 'Feeling unsafe or needing immediate support' : q.field === 'heavyBleeding' ? 'Sudden or unusually heavy bleeding' : q.label;
              return <button key={q.field} className="chip chip--warn" aria-pressed={on} onClick={() => setFlags({ ...flags, [q.field]: !on })}>{label}</button>;
            })}
          </div>
          <Field label="Temperature (°C), if measured" htmlFor="mt"><input id="mt" className="input" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} /></Field>
          <button className="btn btn--soft" onClick={async () => setResult(await api.mother.recoveryCheck({ ...flags, tempC: temp ? Number(temp) : null }))}>Check</button>
          {result?.level === 'none' && <p className="callout">None of the warning signs you checked need urgent care. If something still worries you, call your doctor or midwife.</p>}
        </div>
      </Glass>
      {result && <SafetyPanel result={result} />}

      <Glass>
        <form className="stack stack--lg" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.mother.createRecovery(form); toast('Logged'); void logs.reload(); } catch (er) { toast((er as Error).message); }
        }}>
          <h2 className="subtitle">Log how you feel</h2>
          <Field label="What" htmlFor="sym">
            <select id="sym" className="select" value={form.symptom} onChange={(e) => setForm({ ...form, symptom: e.target.value as Symptom })}>
              {SYMPTOMS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </Field>
          <Scale label="How strong" value={form.severity} min={0} max={10} low="None" high="Worst" onChange={(v) => setForm({ ...form, severity: v })} />
          <Field label="Compared with before">
            <Segmented label="Trend" value={form.trend} onChange={(v) => setForm({ ...form, trend: v })} options={[{ value: 'better', label: 'Better' }, { value: 'same', label: 'Same' }, { value: 'worse', label: 'Worse' }]} />
          </Field>
          <Field label="Started on" htmlFor="on"><input id="on" type="date" className="input" value={form.onset} onChange={(e) => setForm({ ...form, onset: e.target.value })} /></Field>
          <button className="btn" type="submit">Save</button>
        </form>
      </Glass>

      <Glass>
        <h2 className="subtitle">Your notes</h2>
        {!logs.data ? <Loading /> : logs.data.length ? (
          <div className="list">{logs.data.map((r) => (
            <div className="item" key={r.id}>
              <div className="item__body">
                <div className="item__title">{SYMPTOMS.find((s) => s.v === r.symptom)?.label}, {r.severity}/10</div>
                <div className="item__meta">{dayOf(r.createdAt)}</div>
              </div>
              <span className={`badge ${r.trend === 'worse' ? 'badge--urgent' : r.trend === 'better' ? 'badge--ok' : 'badge--quiet'}`}>{r.trend}</span>
            </div>
          ))}</div>
        ) : <p className="empty">No notes yet.</p>}
      </Glass>
    </>
  );
}
