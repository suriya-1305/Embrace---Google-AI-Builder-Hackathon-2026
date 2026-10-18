// Baby-space widgets. Each is self-contained: it loads its own data and either
// acts inline (one tap) or opens its module screen.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useSession } from '../state/session';
import { useLoad } from '../state/useLoad';
import { Icon } from '../components/Icon';
import { describeEvent } from '../components/EventRow';
import { localIso, sinceLabel, todayIso } from '../lib/time';
import { playSound, stopSound } from '../lib/sound';
import type { BabyEvent, Growth, Milestone, VisitReport } from '../types';
import { Spark, Tile } from './Tile';
import { allModules } from './registry';
import { useRefresh } from './refresh';
import { MILESTONE_LABEL } from './labels';

const def = (id: string) => allModules().find((m) => m.id === id)!;
function useEvents(days = 2) {
  const api = useApi(); const { version } = useRefresh();
  return useLoad(() => api.baby.listEvents(days), [api, version]);
}

export function GlanceWidget() {
  const load = useEvents(2);
  const ev = load.data ?? [];
  if (load.error) return <Tile def={def('glance')}><span className="tile__sub">Recent logs could not load.</span></Tile>;
  if (load.loading && !load.data) return <Tile def={def('glance')}><span className="tile__sub" role="status">Loading recent care...</span></Tile>;
  const last = (t: string) => [...ev].reverse().find((e) => e.type === t);
  const sleep = last('sleep');
  const cells = [
    { type: 'feeding', icon: 'bottle', v: sinceLabel(last('feeding')?.startedAt), k: 'since last feed', label: 'feeds today' },
    { type: 'sleep', icon: 'sleep', v: sinceLabel(sleep?.endedAt ?? sleep?.startedAt), k: sleep && !sleep.endedAt ? 'sleep ongoing' : 'since last sleep', label: 'sleep logs today' },
    { type: 'diaper', icon: 'drop', v: sinceLabel(last('diaper')?.startedAt), k: 'since diaper', label: 'diapers today' },
  ];
  return (
    <Tile def={def('glance')}>
      <div className="since" style={{ marginTop: 0 }}>
        {cells.map((c) => <Link className="since__item since__link" key={c.k} to={`/baby/today?type=${c.type}`}><Icon name={c.icon} /><div className="since__value">{c.v}</div><div className="since__label">{c.k}</div><span className="faint">{ev.filter((event) => event.type === c.type && localIso(new Date(event.startedAt)).slice(0, 10) === todayIso()).length} {c.label}</span></Link>)}
      </div>
    </Tile>
  );
}

export function QuickLogWidget() {
  return (
    <Tile def={def('quicklog')}>
      <div className="quick4">
        <Link to="/baby?log=feeding"><span><Icon name="bottle" /></span>Feed</Link>
        <Link to="/baby?log=sleep"><span><Icon name="sleep" /></span>Sleep</Link>
        <Link to="/baby?log=diaper"><span><Icon name="drop" /></span>Diaper</Link>
        <Link to="/baby/sound"><span><Icon name="wave" /></span>Sound</Link>
      </div>
      <Link to="/baby/voice" className="mini-btn" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}><Icon name="mic" />Say it instead</Link>
    </Tile>
  );
}

export function CryCheckWidget() {
  return (
    <Tile def={def('crycheck')}>
      <div className="tile__value">Listen with context</div>
      <div className="tile__sub">A short recording and recent care logs help organize what to check next.</div>
      <Link to="/baby/sound" className="mini-btn mini-btn--hue" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}><Icon name="wave" />Check baby sounds</Link>
    </Tile>
  );
}

export function InsightsWidget() {
  const api = useApi(); const { version } = useRefresh();
  const infant = useLoad(() => api.baby.getInfant(), [api]);
  const logs = useLoad(() => api.baby.listEvents(7), [api, version]);
  const rows = logs.data ?? [];
  return (
    <Tile def={def('insights')}>
      <div className="tile__sub">{infant.data ? `${infant.data.name}'s last 7 days` : 'Your baby’s last 7 days'}</div>
      {logs.error ? <p className="small">Your timeline will be available when you reconnect.</p> : logs.loading && !logs.data ? <p className="small" role="status">Loading care logs...</p> : <div className="insight-counts">{(['feeding', 'sleep', 'diaper'] as const).map((type) => <div key={type}><strong>{rows.filter((row) => row.type === type).length}</strong><span>{type === 'feeding' ? 'feeds' : type === 'sleep' ? 'sleep logs' : 'diaper logs'}</span></div>)}</div>}
      <Link to="/insights" className="link-btn">View timeline & weekly patterns</Link>
    </Tile>
  );
}

export function RecentWidget() {
  const ev = useEvents(2).data ?? [];
  const recent = [...ev].reverse().slice(0, 3);
  return (
    <Tile def={def('recent')}>
      {recent.length ? recent.map((e: BabyEvent) => {
        const { title, meta } = describeEvent(e);
        return <div key={e.id} className="row row--between small"><span>{title}</span><span className="faint">{meta}</span></div>;
      }) : <span className="tile__sub">Nothing logged yet today.</span>}
    </Tile>
  );
}

export function PatternsWidget() {
  const api = useApi(); const { version } = useRefresh();
  const b = useLoad(() => api.baby.baseline(7), [api, version]).data;
  return (
    <Tile def={def('patterns')}>
      <div className="tile__value">{b ? `${b.coverage.daysWithData}/7` : '...'}</div>
      <div className="tile__sub">days logged</div>
      {b && <Spark values={b.days.map((d) => (d.hasData ? d.feeds : null))} />}
    </Tile>
  );
}

export function GrowthWidget() {
  const api = useApi(); const { version } = useRefresh();
  const rows = (useLoad(() => api.baby.records<Growth>('growth'), [api, version]).data ?? []).filter((g) => g.weightKg);
  const last = rows[rows.length - 1];
  return (
    <Tile def={def('growth')}>
      <div className="tile__value">{last ? `${last.weightKg} kg` : 'Add weight'}</div>
      <div className="tile__sub">{last ? `measured ${new Date(`${last.date}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : 'Weight, length, head'}</div>
      <Spark values={rows.map((g) => g.weightKg ?? null)} />
    </Tile>
  );
}

export function VaccinesWidget() {
  const api = useApi(); const { region } = useSession(); const { version } = useRefresh();
  const load = useLoad(() => api.baby.vaccines(region), [api, region, version]);
  const s = load.data;
  if (!s) return <Tile def={def('vaccines')}><span className="tile__sub" role="status">{load.error ? 'Schedule unavailable. Please try again.' : 'Loading schedule...'}</span></Tile>;
  const due = s?.doses.filter((d) => d.status === 'due_now') ?? [];
  const next = s?.doses.find((d) => d.status === 'upcoming');
  return (
    <Tile def={def('vaccines')}>
      {due.length ? <><div className="tile__value">{due.length} due</div><div className="tile__sub">{due.slice(0, 2).map((d) => d.name).join(', ')}{due.length > 2 ? '...' : ''}</div></>
        : next ? <><div className="tile__value">{new Date(`${next.dueDate}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short' })}</div><div className="tile__sub">next: {next.name}</div></>
          : <div className="tile__sub">{s.message ?? 'No doses due on this schedule'}</div>}
    </Tile>
  );
}

export function MilestonesWidget() {
  const api = useApi(); const { version } = useRefresh();
  const rows = useLoad(() => api.baby.records<Milestone>('milestones'), [api, version]).data ?? [];
  const last = rows[rows.length - 1];
  return (
    <Tile def={def('milestones')}>
      {last ? (
        <div className="row" style={{ position: 'relative', alignItems: 'center' }}>
          {last.photo ? <img src={last.photo} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }} />
            : <span className="tile__icon" style={{ width: 64, height: 64, borderRadius: 18 }}><Icon name="heart" /></span>}
          <div><div className="tile__value" style={{ fontSize: 'var(--t-lg)' }}>{MILESTONE_LABEL[last.milestone]}</div><div className="tile__sub">{last.note}</div></div>
        </div>
      ) : <div className="tile__sub">Save first smiles, rolls and other moments.</div>}
    </Tile>
  );
}

export function SootheWidget() {
  const [on, setOn] = useState(false);
  return (
    <Tile def={def('soothe')}>
      <div className="tile__value">{on ? 'Playing' : 'Shush'}</div>
      <div className="tile__sub">{on ? 'Soft shushing sound' : 'White noise, heartbeat, lullaby'}</div>
      <button className="mini-btn mini-btn--hue" aria-pressed={on} onClick={() => { if (on) { stopSound(); setOn(false); } else { playSound('shush'); setOn(true); } }}>
        {on ? 'Stop' : 'Play'}
      </button>
    </Tile>
  );
}

export function VisitWidget() {
  const api = useApi(); const { version } = useRefresh();
  const q = useLoad(() => api.baby.records('visit_questions'), [api, version]).data ?? [];
  const reports = useLoad(() => api.baby.records<VisitReport>('visit_reports'), [api, version]).data ?? [];
  const next = reports.filter((report) => report.nextVisitOn && report.nextVisitOn >= todayIso()).sort((first, second) => first.nextVisitOn!.localeCompare(second.nextVisitOn!))[0];
  return (
    <Tile def={def('visit')}>
      <div className="tile__value">{next ? new Date(`${next.nextVisitOn}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short' }) : `${q.length} ${q.length === 1 ? 'question' : 'questions'}`}</div>
      <div className="tile__sub">{next ? 'Next follow-up appointment' : 'Prepare a summary or add a follow-up report'}</div>
    </Tile>
  );
}
