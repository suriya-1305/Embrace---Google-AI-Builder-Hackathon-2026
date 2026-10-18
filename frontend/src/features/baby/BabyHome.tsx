// Baby home: a simple header, any partner nudge, then the bento of enabled modules.
import { useSearchParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useApi, useSession } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { Glass } from '../../components/Layout';
import { Sheet } from '../../components/Sheet';
import { Loading } from '../../components/Controls';
import { EventEditor, newDraft } from './EventEditor';
import { ageLabel, greeting } from '../../lib/time';
import { allModules, useModules } from '../../modules/registry';
import { useRefresh } from '../../modules/refresh';
import type { EventType } from '../../types';
import { logDraftKey, removeLogDraft } from '../../state/logDrafts';

export function BabyHome() {
  const api = useApi();
  const { session, setActiveInfant } = useSession();
  const toast = useToast();
  const { enabled } = useModules();
  const { bump } = useRefresh();
  useEffect(() => {
    const sync = async () => {
      try {
        const count = await api.baby.syncOfflineEvents();
        if (count > 0) { toast(`${count} offline log${count === 1 ? '' : 's'} synced`); bump(); }
      } catch { /* keep encrypted events queued until the next connection */ }
    };
    window.addEventListener('online', sync);
    if (navigator.onLine) void sync();
    return () => window.removeEventListener('online', sync);
  }, [api, bump, toast]);
  const infant = useLoad(() => api.baby.getInfant(), [api]);
  const infants = useLoad(() => api.baby.listInfants(), [api]);
  const [params, setParams] = useSearchParams();
  const requestedLog = params.get('log');
  const logging = requestedLog && ['feeding', 'sleep', 'diaper'].includes(requestedLog) ? requestedLog as EventType : null;
  const [saving, setSaving] = useState(false);

  if (infant.error) return <Glass><p>{infant.error.message}</p></Glass>;
  if (!infant.data) return <Loading />;
  const mods = allModules().filter((m) => m.space === 'baby' && enabled.has(m.id) && m.Widget);
  const widgets = (ids: string[]) => ids.map((id) => mods.find((module) => module.id === id)).filter((module) => !!module).map((module) => { const Widget = module!.Widget!; return <Widget key={module!.id} />; });

  return (
    <>
      <div className="hero">
        <div>
          <span className="muted small">{greeting()}, {session?.displayName}</span>
          <h1 className="hero__name">{infant.data.name}</h1>
          <span className="muted small">{ageLabel(infant.data.ageDays)}</span>
        </div>
      </div>

      {(infants.data?.length ?? 0) > 1 && (
        <label className="field">
          <span className="field__label">Baby profile</span>
          <select className="select" value={session?.infantId ?? infant.data.id} onChange={(event) => setActiveInfant(event.target.value)}>
            {infants.data?.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </select>
        </label>
      )}
      <section className="home-section" aria-label="Daily care">
        <div className="bento home-primary">{widgets(['glance', 'quicklog', 'crycheck', 'insights'])}</div>
      </section>
      <section className="home-section"><h2 className="subtitle">Health & milestones</h2><div className="bento">{widgets(['vaccines', 'growth', 'milestones'])}</div></section>
      <section className="home-section"><h2 className="subtitle">Comfort & appointments</h2><div className="bento">{widgets(['soothe', 'visit'])}</div></section>
      {!mods.length && <Glass><p className="empty">Choose your home features in <Link to="/profile">Profile</Link>.</p></Glass>}

      {logging && (
        <Sheet title={`Log ${logging}`} dismissible={!saving} onClose={() => setParams({})}>
          <EventEditor initial={newDraft(logging)} saving={saving} onSave={async (d) => {
            setSaving(true);
            try { const saved = await api.baby.createEvent(d); if (session?.infantId) removeLogDraft(logDraftKey(session.uid, session.infantId, d.type)); toast(saved.syncStatus === 'pending' ? 'Saved offline; it will sync when you reconnect.' : 'Saved'); setParams({}); bump(); }
            catch (e) { toast((e as Error).message); }
            finally { setSaving(false); }
          }} />
        </Sheet>
      )}
    </>
  );
}
