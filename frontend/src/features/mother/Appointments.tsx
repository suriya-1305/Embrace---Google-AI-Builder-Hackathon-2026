import { useState } from 'react';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Field } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { todayIso } from '../../lib/time';

export function Appointments() {
  const api = useApi(); const toast = useToast();
  const rows = useLoad(() => api.mother.records('appointments'), [api]);
  const [f, setF] = useState({ title: '', date: todayIso(), note: '' });
  const fmt = (d: string) => new Date(`${d}T12:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><h1 className="title">Follow-ups</h1><p className="lede">Your own check-ups matter too: the 6-week check, stitch reviews, blood pressure.</p></div>
      <Glass>
        <div className="list">{(rows.data ?? []).map((a) => (
          <div className="item" key={a.id}>
            <input type="checkbox" aria-label={`Mark ${a.title} done`} checked={a.done} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }}
              onChange={async (e) => { await api.mother.updateRecord('appointments', a.id, { title: a.title, date: a.date, note: a.note ?? null, done: e.target.checked }); void rows.reload(); }} />
            <div className="item__body"><div className="item__title" style={{ textDecoration: a.done ? 'line-through' : 'none' }}>{a.title}</div><div className="item__meta">{fmt(a.date)}{a.note ? `, ${a.note}` : ''}</div></div>
            <button className="icon-btn" aria-label={`Delete ${a.title}`} onClick={async () => { await api.mother.deleteRecord('appointments', a.id); void rows.reload(); }}><Icon name="trash" /></button>
          </div>
        ))}</div>
      </Glass>
      <Glass>
        <form className="stack stack--lg" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.mother.addRecord('appointments', { title: f.title, date: f.date, note: f.note || null, done: false }); toast('Added'); setF({ title: '', date: todayIso(), note: '' }); void rows.reload(); }
          catch (er) { toast((er as Error).message); }
        }}>
          <h2 className="subtitle">Add a follow-up</h2>
          <div className="chips">{['6-week postnatal check', 'Stitch review', 'Blood pressure follow-up', 'Lactation visit'].map((t) => <button type="button" key={t} className="chip" onClick={() => setF({ ...f, title: t })}>{t}</button>)}</div>
          <Field label="What" htmlFor="at"><input id="at" className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="When" htmlFor="ad"><input id="ad" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Note (optional)" htmlFor="an"><input id="an" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <button className="btn" type="submit" disabled={!f.title}>Add follow-up</button>
        </form>
      </Glass>
    </>
  );
}
