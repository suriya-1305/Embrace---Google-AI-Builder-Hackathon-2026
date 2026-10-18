// Letter to my baby: milestones from the logs plus moments she chooses, gathered
// into a keepsake. Deterministic template; nothing is invented.
import { useMemo, useState } from 'react';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { BackLink, Glass } from '../../components/Layout';
import { Field } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { MILESTONE_LABEL } from '../../modules/labels';
import type { Milestone } from '../../types';

export function Letter() {
  const api = useApi();
  const infant = useLoad(() => api.baby.getInfant(), [api]).data;
  const mother = useLoad(() => api.mother.getMother(), [api]).data;
  const milestones = useLoad(() => api.baby.records<Milestone>('milestones'), [api]).data ?? [];
  const wins = useLoad(() => api.mother.records('wins'), [api]).data ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const fmt = (d: string) => new Date(`${d}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'long' });

  const paragraphs = useMemo(() => {
    if (!infant) return [];
    const out = [`Dear ${infant.name},`];
    out.push(`You are ${Math.floor(infant.ageDays / 7)} weeks old as I write this. These are some of the moments I want you to know about one day.`);
    milestones.forEach((m) => out.push(`On ${fmt(m.date)}: ${MILESTONE_LABEL[m.milestone].toLowerCase()}.${m.note ? ` ${m.note}` : ''}`));
    wins.filter((w) => picked.includes(w.id)).forEach((w) => out.push(`A good moment on ${fmt(w.date)}: ${w.text}`));
    if (note.trim()) out.push(note.trim());
    return out;
  }, [infant, milestones, wins, picked, note]);

  return (
    <>
      <div className="no-print"><BackLink to="/me" label="My space" /></div>
      <div className="stack no-print"><h1 className="title">Letter to {infant?.name ?? 'my baby'}</h1><p className="lede">Built only from moments you saved. Add your own words, then keep it for the first birthday.</p></div>
      <Glass variant="no-print">
        <div className="stack stack--lg">
          {wins.length > 0 && <div className="stack"><strong>Include good moments</strong>
            {wins.map((w) => <label className="check" key={w.id}><input type="checkbox" checked={picked.includes(w.id)} onChange={() => setPicked(picked.includes(w.id) ? picked.filter((x) => x !== w.id) : [...picked, w.id])} /><span>{w.text}</span></label>)}
          </div>}
          <Field label="Your words" htmlFor="ln"><textarea id="ln" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Something you want to tell them one day" /></Field>
        </div>
      </Glass>
      <article className="letter" aria-label="Letter preview">
        {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        <p className="letter__sign">With all my love,<br />{mother?.name ?? 'Amma'}</p>
      </article>
      <button className="btn no-print" onClick={() => window.print()}><Icon name="download" />Print or save as PDF</button>
    </>
  );
}
