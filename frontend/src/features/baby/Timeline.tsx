import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, useSession } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { EventRow } from '../../components/EventRow';
import { Sheet } from '../../components/Sheet';
import { Loading } from '../../components/Controls';
import { EventEditor } from './EventEditor';
import { dayOf, localIso, todayIso } from '../../lib/time';
import type { EventType, FamilyTimelineEvent } from '../../types';

const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return localIso(date).slice(0, 10); };

export function Timeline({ embedded = false, todayOnly = false }: { embedded?: boolean; todayOnly?: boolean }) {
  const api = useApi();
  const { session, setActiveInfant } = useSession();
  const toast = useToast();
  const [params] = useSearchParams();
  const [fromDate, setFromDate] = useState(todayOnly ? todayIso() : daysAgo(6));
  const [toDate, setToDate] = useState(todayIso());
  const days = todayOnly ? 2 : Math.min(120, Math.max(1, Math.ceil((Date.now() - new Date(`${fromDate}T00:00`).getTime()) / 86400000) + 1));
  const events = useLoad<FamilyTimelineEvent[]>(() => api.baby.familyEvents(days), [api, days]);
  const infants = useLoad(() => api.baby.listInfants(), [api]);
  const [filter, setFilter] = useState<EventType | 'all'>(() => ['feeding', 'sleep', 'diaper'].includes(params.get('type') ?? '') ? params.get('type') as EventType : 'all');
  const [infantFilter, setInfantFilter] = useState(session?.infantId ?? 'all');
  const [editing, setEditing] = useState<FamilyTimelineEvent | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [fromDate, toDate, filter, infantFilter]);

  const filteredRows = useMemo(() => (events.data ?? []).filter((event) =>
    (filter === 'all' || event.type === filter) && (infantFilter === 'all' || event.infantId === infantFilter)
    && localIso(new Date(event.startedAt)).slice(0, 10) >= fromDate && localIso(new Date(event.startedAt)).slice(0, 10) <= toDate), [events.data, filter, infantFilter, fromDate, toDate]);
  const pages = Math.max(1, Math.ceil(filteredRows.length / 12));
  const currentPage = Math.min(page, pages - 1);
  const groups = useMemo(() => {
    const rows = [...filteredRows].sort((first, second) => new Date(second.startedAt).getTime() - new Date(first.startedAt).getTime()).slice(currentPage * 12, (currentPage + 1) * 12);
    const map = new Map<string, FamilyTimelineEvent[]>();
    rows.forEach((e) => { const k = dayOf(e.startedAt); map.set(k, [...(map.get(k) ?? []), e]); });
    return [...map.entries()];
  }, [filteredRows, currentPage]);
  const summary = useMemo(() => ({
    feeds: filteredRows.filter((event) => event.type === 'feeding').length,
    sleep: filteredRows.filter((event) => event.type === 'sleep').length,
    diapers: filteredRows.filter((event) => event.type === 'diaper').length,
  }), [filteredRows]);

  return (
    <>
      {!embedded && <BackLink to="/baby" label="Baby" />}
      {!embedded && <div className="stack"><h1 className="title">{todayOnly ? 'Today’s care' : 'Family timeline'}</h1><p className="muted">{todayOnly ? 'Feeds, sleep and diaper changes logged today.' : 'Your children’s care, one period at a time.'}</p></div>}
      {!todayOnly && <><div className="chips" role="group" aria-label="Timeline date range">
        {([1, 7, 30, 120] as const).map((range) => <button key={range} className="chip" aria-pressed={fromDate === daysAgo(range - 1) && toDate === todayIso()} onClick={() => { setFromDate(daysAgo(range - 1)); setToDate(todayIso()); }}>{range === 1 ? 'Today' : range === 120 ? '4 months' : `${range} days`}</button>)}
      </div><div className="date-range"><label className="field"><span className="field__label">From</span><input className="input" type="date" aria-label="Timeline from date" min={daysAgo(119)} max={toDate} value={fromDate} onChange={(event) => { if (event.target.value) setFromDate(event.target.value); }} /></label><label className="field"><span className="field__label">To</span><input className="input" type="date" aria-label="Timeline to date" min={fromDate} max={todayIso()} value={toDate} onChange={(event) => { if (event.target.value) setToDate(event.target.value); }} /></label></div></>}
      {!todayOnly && (infants.data?.length ?? 0) > 1 && <div className="chips" role="group" aria-label="Filter by baby">
        <button className="chip" aria-pressed={infantFilter === 'all'} onClick={() => setInfantFilter('all')}>All babies</button>
        {infants.data?.map((child) => <button key={child.id} className="chip" aria-pressed={infantFilter === child.id} onClick={() => setInfantFilter(child.id)}>{child.name}</button>)}
      </div>}
      <section aria-label="Summary for selected period">
        <div className="row row--between"><h2 className="subtitle">{todayOnly ? 'Logged today' : 'Logged this period'}</h2><span className="faint">Counts only</span></div>
        <div className="since">
          <div className="since__item"><div className="since__value">{events.loading && !events.data ? '-' : summary.feeds}</div><div className="faint">feeds</div></div>
          <div className="since__item"><div className="since__value">{events.loading && !events.data ? '-' : summary.sleep}</div><div className="faint">sleep logs</div></div>
          <div className="since__item"><div className="since__value">{events.loading && !events.data ? '-' : summary.diapers}</div><div className="faint">diaper logs</div></div>
        </div>
      </section>
      <div className="chips" role="group" aria-label="Filter">
        {(['all', 'feeding', 'sleep', 'diaper'] as const).map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {{ all: 'Everything', feeding: 'Feeds', sleep: 'Sleep', diaper: 'Diapers' }[f]}
          </button>
        ))}
      </div>
      <Glass>
        {events.error ? <p className="callout" role="alert">{events.error.message}</p> : events.loading && !events.data ? <Loading /> : groups.length ? groups.map(([day, rows]) => (
          <div key={day}>
            <div className="day-label">{day}</div>
            <div className="list">{rows.map((e) => <div key={`${e.infantId}-${e.id}`}><div className="faint">{e.infantName}</div><EventRow event={e} onEdit={() => { setActiveInfant(e.infantId); setEditing(e); }} /></div>)}</div>
          </div>
        )) : <p className="empty">No family logs in this date range.</p>}
      </Glass>
      <nav className="pagination" aria-label="Timeline pages"><button className="btn btn--small btn--soft" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="faint" aria-live="polite">Page {currentPage + 1} of {pages} · {filteredRows.length} logs</span><button className="btn btn--small btn--soft" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next</button></nav>
      {editing && (
        <Sheet title={`Edit ${editing.infantName}'s log`} onClose={() => setEditing(null)}>
          <EventEditor initial={editing} saveLabel="Save changes"
            onSave={async (d) => {
              try { await api.baby.updateEvent(editing.id, { startedAt: d.startedAt, endedAt: d.endedAt, details: d.details, note: d.note }); toast('Changes saved'); setEditing(null); void events.reload(); }
              catch (e) { toast((e as Error).message); }
            }}
            onDelete={async () => { await api.baby.deleteEvent(editing.id); toast('Deleted'); setEditing(null); void events.reload(); }} />
        </Sheet>
      )}
    </>
  );
}
