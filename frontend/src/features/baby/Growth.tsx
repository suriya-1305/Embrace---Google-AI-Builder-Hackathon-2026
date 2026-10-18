import { useState } from 'react';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Field } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { todayIso } from '../../lib/time';
import type { Growth as G } from '../../types';

function Chart({ rows, birth }: { rows: G[]; birth: string }) {
  const pts = rows.filter((r) => r.weightKg).map((r) => ({ d: (Date.parse(r.date) - Date.parse(birth)) / 86400000, w: r.weightKg! }));
  if (pts.length < 2) return <p className="faint">Add two or more weights to see a trend.</p>;
  const maxD = Math.max(...pts.map((p) => p.d), 7); const minW = Math.min(...pts.map((p) => p.w)) - 0.3; const maxW = Math.max(...pts.map((p) => p.w)) + 0.3;
  const x = (d: number) => 30 + (d / maxD) * 260; const y = (w: number) => 150 - ((w - minW) / (maxW - minW)) * 130;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox="0 0 300 175" role="img" aria-label={`Weight from ${pts[0].w} kg to ${pts[pts.length - 1].w} kg`}>
      {[minW, (minW + maxW) / 2, maxW].map((w) => <g key={w}><line x1="30" x2="290" y1={y(w)} y2={y(w)} stroke="currentColor" opacity="0.12" /><text x="2" y={y(w) + 3}>{w.toFixed(1)}</text></g>)}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {pts.map((p) => <circle key={p.d} cx={x(p.d)} cy={y(p.w)} r="4" fill="currentColor" />)}
      <text x="30" y="172">birth</text><text x="250" y="172">day {Math.round(maxD)}</text>
    </svg>
  );
}

export function Growth() {
  const api = useApi(); const toast = useToast();
  const infant = useLoad(() => api.baby.getInfant(), [api]);
  const rows = useLoad(() => api.baby.records<G>('growth'), [api]);
  const [f, setF] = useState({ date: todayIso(), weightKg: '', lengthCm: '', headCm: '' });
  const n = (v: string) => (v === '' ? null : Number(v));
  return (
    <>
      <BackLink to="/baby" label="Home" />
      <div className="stack"><h1 className="title">Growth</h1><p className="lede">Keep measurements from check-ups in one place.</p></div>
      <Glass variant="hue-mint">{infant.data && <Chart rows={rows.data ?? []} birth={infant.data.birthDate} />}
        <p className="faint" style={{ marginTop: 8 }}>Your baby's own trend. WHO percentile curves will appear once the official WHO tables are added to the app.</p></Glass>
      <Glass>
        <form className="stack stack--lg" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.baby.addRecord('growth', { date: f.date, weightKg: n(f.weightKg), lengthCm: n(f.lengthCm), headCm: n(f.headCm), note: null }); toast('Saved'); setF({ ...f, weightKg: '', lengthCm: '', headCm: '' }); void rows.reload(); }
          catch (er) { toast((er as Error).message); }
        }}>
          <h2 className="subtitle">Add a measurement</h2>
          <Field label="Date" htmlFor="gd"><input id="gd" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <div className="row">
            <Field label="Weight (kg)" htmlFor="gw"><input id="gw" className="input" inputMode="decimal" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} /></Field>
            <Field label="Length (cm)" htmlFor="gl"><input id="gl" className="input" inputMode="decimal" value={f.lengthCm} onChange={(e) => setF({ ...f, lengthCm: e.target.value })} /></Field>
            <Field label="Head (cm)" htmlFor="gh"><input id="gh" className="input" inputMode="decimal" value={f.headCm} onChange={(e) => setF({ ...f, headCm: e.target.value })} /></Field>
          </div>
          <button className="btn" type="submit" disabled={!f.weightKg && !f.lengthCm && !f.headCm}>Save measurement</button>
        </form>
      </Glass>
      <Glass>
        <div className="list">{[...(rows.data ?? [])].reverse().map((g) => (
          <div className="item" key={g.id}>
            <div className="item__body"><div className="item__title">{[g.weightKg && `${g.weightKg} kg`, g.lengthCm && `${g.lengthCm} cm long`, g.headCm && `head ${g.headCm} cm`].filter(Boolean).join(', ')}</div><div className="item__meta">{g.date}</div></div>
            <button className="icon-btn" aria-label="Delete measurement" onClick={async () => { await api.baby.deleteRecord('growth', g.id); void rows.reload(); }}><Icon name="trash" /></button>
          </div>
        ))}</div>
      </Glass>
    </>
  );
}
