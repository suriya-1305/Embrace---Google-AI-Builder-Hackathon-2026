// Doctor visit prep: a printable one-page summary plus the parent's own questions.
import { useState } from 'react';
import { useApi, useSession } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/Controls';
import { ageLabel } from '../../lib/time';
import type { Growth, VisitQuestion, VisitReport } from '../../types';
import { CareRecordEditor } from './CareRecordEditor';
import { useRefresh } from '../../modules/refresh';

export function VisitPrep() {
  const api = useApi(); const { region } = useSession(); const toast = useToast();
  const [days, setDays] = useState('7');
  const infant = useLoad(() => api.baby.getInfant(), [api]).data;
  const base = useLoad(() => api.baby.baseline(Number(days)), [api, days]).data;
  const growthState = useLoad(() => api.baby.records<Growth>('growth'), [api]);
  const growth = growthState.data ?? [];
  const vaxState = useLoad(() => api.baby.vaccines(region), [api, region]);
  const vax = vaxState.data;
  const reports = useLoad(() => api.baby.records<VisitReport>('visit_reports'), [api]);
  const [reporting, setReporting] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const { bump } = useRefresh();
  const qs = useLoad(() => api.baby.records<VisitQuestion>('visit_questions'), [api]);
  const [q, setQ] = useState('');
  const g = growth[growth.length - 1];
  const m = base?.metrics;
  return (
    <>
      <div className="no-print"><BackLink to="/baby" label="Home" /></div>
      <div className="page-heading no-print"><h1 className="title">Doctor visit</h1><p className="muted">Prepare before the visit. Bring the care record up to date afterwards.</p></div>
      <section className="home-section no-print"><h2 className="subtitle">After the appointment</h2><p className="muted">Add the follow-up report to update measured height, weight and confirmed vaccines.</p><button className="btn btn--soft" disabled={editorBusy} onClick={() => setReporting(!reporting)}><Icon name="clipboard" />{reporting ? 'Close follow-up editor' : 'Add follow-up report'}</button>{reporting && <CareRecordEditor purpose="visit" onBusyChange={setEditorBusy} onCancel={() => setReporting(false)} onSaved={() => { setReporting(false); void reports.reload(); void growthState.reload(); void vaxState.reload(); bump(); }} />}</section>
      <div className="row row--between no-print">
        <Segmented label="Period" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }]} />
        <button className="btn btn--small" onClick={() => window.print()}><Icon name="download" />Print or save PDF</button>
      </div>
      <Glass>
        <div className="stack">
          <h1 className="title">{infant?.name}, {infant && ageLabel(infant.ageDays)}</h1>
          <p className="faint">Summary of the last {days} days from the family's own logs. Not a clinical record.</p>
          <hr className="divider" />
          <strong>Feeding and sleep</strong>
          <p className="small">Days with logs: {base?.coverage.daysWithData} of {base?.coverage.totalDays}. Feeds a day: {m?.feedsPerDay ?? 'not enough data'}. Typical gap: {m?.typicalFeedGapMin != null ? `${Math.floor(m.typicalFeedGapMin / 60)} h ${m.typicalFeedGapMin % 60} min` : 'not enough data'}. Sleep logged a day: {m?.sleepHoursPerDay ?? 'n/a'} h. Wet diapers a day: {m?.wetDiapersPerDay ?? 'n/a'}.</p>
          <strong>Growth</strong>
          <p className="small">{g ? `Latest (${g.date}): ${[g.weightKg && `${g.weightKg} kg`, g.lengthCm && `${g.lengthCm} cm`, g.headCm && `head ${g.headCm} cm`].filter(Boolean).join(', ')}` : 'No measurements yet.'}</p>
          <strong>Vaccines</strong>
          <p className="small">{vax?.doses.filter((d) => d.status === 'due_now').map((d) => d.name).join(', ') || 'None due now.'}</p>
          <strong>Questions to ask</strong>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>{(qs.data ?? []).map((x) => (
            <li key={x.id}>{x.text} <button className="link-btn no-print" aria-label={`Remove question ${x.text}`} onClick={async () => { await api.baby.deleteRecord('visit_questions', x.id); void qs.reload(); }}>Remove</button></li>
          ))}</ol>
          <form className="row no-print" onSubmit={async (e) => { e.preventDefault(); if (!q.trim()) return; await api.baby.addRecord('visit_questions', { text: q }); setQ(''); toast('Question added'); void qs.reload(); }}>
            <input className="input" placeholder="Add a question for the doctor" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Add a question" />
            <button className="btn btn--small" type="submit">Add</button>
          </form>
        </div>
      </Glass>
      <section className="home-section no-print"><h2 className="subtitle">Follow-up reports</h2>{reports.error && <p role="alert">{reports.error.message}</p>}{reports.data?.length ? [...reports.data].reverse().map((report) => <article className="glass" key={report.id}><strong>{report.date}{report.clinician ? ` · ${report.clinician}` : ''}</strong>{report.note && <p>{report.note}</p>}{report.nextVisitOn && <p className="faint">Next appointment: {report.nextVisitOn}</p>}</article>) : <p className="faint">No follow-up report added yet.</p>}</section>
    </>
  );
}
