import { useState } from 'react';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Field } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { resizeImage } from '../../lib/image';
import { todayIso } from '../../lib/time';
import { MILESTONE_LABEL } from '../../modules/labels';
import type { Milestone, MilestoneKey } from '../../types';

export function Milestones() {
  const api = useApi(); const toast = useToast();
  const rows = useLoad(() => api.baby.records<Milestone>('milestones'), [api]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<{ milestone: MilestoneKey; date: string; note: string; photo: string | null }>({ milestone: 'first_smile', date: todayIso(), note: '', photo: null });
  return (
    <>
      <BackLink to="/baby" label="Home" />
      <div className="row row--between"><div className="stack"><h1 className="title">Milestones</h1><p className="lede">Moments worth keeping, even on calm days.</p></div></div>
      <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />Add a moment</button>
      <div className="memories">
        {[...(rows.data ?? [])].reverse().map((m) => (
          <article className="memory" key={m.id}>
            {m.photo ? <img className="memory__img" src={m.photo} alt={MILESTONE_LABEL[m.milestone]} /> : <div className="memory__img"><Icon name="heart" /></div>}
            <div className="memory__body"><strong>{MILESTONE_LABEL[m.milestone]}</strong><div className="faint">{new Date(`${m.date}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'long' })}</div>{m.note && <p className="small" style={{ marginTop: 4 }}>{m.note}</p>}</div>
          </article>
        ))}
      </div>
      {!rows.data?.length && <Glass><p className="empty">No moments yet. Add the first smile when it happens.</p></Glass>}
      {adding && (
        <Sheet title="Add a moment" onClose={() => setAdding(false)}>
          <form className="stack stack--lg" onSubmit={async (e) => {
            e.preventDefault();
            try { await api.baby.addRecord('milestones', { ...f, note: f.note || null }); toast('Moment saved'); setAdding(false); setF({ milestone: 'first_smile', date: todayIso(), note: '', photo: null }); void rows.reload(); }
            catch (er) { toast((er as Error).message); }
          }}>
            <h2 className="title">Add a moment</h2>
            <div className="chips">{(Object.keys(MILESTONE_LABEL) as MilestoneKey[]).map((k) => <button type="button" key={k} className="chip" aria-pressed={f.milestone === k} onClick={() => setF({ ...f, milestone: k })}>{MILESTONE_LABEL[k]}</button>)}</div>
            <Field label="Date" htmlFor="md"><input id="md" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="A few words (optional)" htmlFor="mn"><input id="mn" className="input" value={f.note} maxLength={500} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            <Field label="Photo (optional)" htmlFor="mp" hint="Resized on your phone before saving.">
              <input id="mp" type="file" accept="image/*" className="input" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                try { setF({ ...f, photo: await resizeImage(file) }); } catch (er) { toast((er as Error).message); }
              }} />
            </Field>
            {f.photo && <img src={f.photo} alt="Preview" style={{ width: 120, borderRadius: 16 }} />}
            <button className="btn" type="submit">Save moment</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
