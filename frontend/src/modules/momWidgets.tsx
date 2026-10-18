// Mother's-space widgets. Private to her; nothing here is visible to the household.
import { useState } from 'react';
import { useApi } from '../state/session';
import { useLoad } from '../state/useLoad';
import { useToast } from '../state/toast';
import { Icon } from '../components/Icon';
import { Switch } from '../components/Controls';
import { todayIso } from '../lib/time';
import { Tile } from './Tile';
import { allModules } from './registry';
import { useRefresh } from './refresh';

const def = (id: string) => allModules().find((m) => m.id === id)!;
const shortDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

function useHome() {
  const api = useApi(); const { version } = useRefresh();
  return useLoad(() => api.mother.home(), [api, version]).data;
}

export function CheckinWidget() {
  const h = useHome();
  return <Tile def={def('checkin')}><div className="tile__value">{h?.checkedInToday ? 'Done' : 'How today?'}</div><div className="tile__sub">{h?.checkedInToday ? 'Add another any time' : '30 seconds, skip anything'}</div></Tile>;
}
export function JournalWidget() {
  const h = useHome();
  return <Tile def={def('journal')}><div className="tile__value">{h?.journalCount ?? 0}</div><div className="tile__sub">saved {h?.journalCount === 1 ? 'entry' : 'entries'}</div></Tile>;
}
export function SupportChatWidget() {
  return <Tile def={def('supportchat')}><div className="tile__value">A little room to breathe</div><div className="tile__sub">Talk with Emi, your Embrace AI companion.</div></Tile>;
}
export function RecoveryWidget() {
  const h = useHome();
  return <Tile def={def('recovery')}><div className="tile__value">{h?.lastRecovery ? h.lastRecovery.trend : 'Log'}</div><div className="tile__sub">{h?.lastRecovery ? `${h.lastRecovery.symptom.replace('_', ' ')}, ${h.lastRecovery.severity}/10` : 'How your body is healing'}</div></Tile>;
}
export function MedicinesWidget() {
  const h = useHome();
  return <Tile def={def('medicines')}>{h ? <><div className="tile__value">{h.nextDose ? h.nextDose.scheduledFor.slice(11) : 'No pending reminders'}</div><div className="tile__sub">{h.nextDose ? h.nextDose.name : 'From the schedule you entered'}</div></> : <span className="tile__sub" role="status">Loading reminders...</span>}</Tile>;
}
export function QuestionnaireWidget() {
  return <Tile def={def('questionnaire')}><div className="tile__value">5 questions</div><div className="tile__sub">Weekly well-being</div></Tile>;
}
export function ShareWidget() {
  return <Tile def={def('share')}><div className="tile__value">QR or send</div><div className="tile__sub">You choose what and with whom</div></Tile>;
}

export function HydrationWidget() {
  const api = useApi(); const toast = useToast(); const { version, bump } = useRefresh();
  const rows = useLoad(() => api.mother.records('hydration'), [api, version]).data ?? [];
  const today = rows.find((r) => r.date === todayIso())?.glasses ?? 0;
  const set = async (n: number) => { try { await api.mother.addRecord('hydration', { date: todayIso(), glasses: Math.max(0, Math.min(20, n)) }); bump(); } catch (e) { toast((e as Error).message); } };
  return (
    <Tile def={def('hydration')}>
      <div className="tile__value">{today} of 8</div>
      <div className="drops" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} data-on={i < today} />)}</div>
      <div className="row">
        <button className="mini-btn" aria-label="One glass less" onClick={() => set(today - 1)}>−</button>
        <button className="mini-btn mini-btn--hue" onClick={() => set(today + 1)}><Icon name="plus" />Glass</button>
      </div>
    </Tile>
  );
}

export function WinsWidget() {
  const api = useApi(); const toast = useToast(); const { version, bump } = useRefresh();
  const rows = useLoad(() => api.mother.records('wins'), [api, version]).data ?? [];
  const [text, setText] = useState('');
  const last = rows[rows.length - 1];
  return (
    <Tile def={def('wins')}>
      {last && <p style={{ position: 'relative', fontFamily: 'var(--font-display)' }}>"{last.text}"</p>}
      <form className="row" onSubmit={async (e) => {
        e.preventDefault(); if (!text.trim()) return;
        try { await api.mother.addRecord('wins', { text, date: todayIso() }); setText(''); toast('Saved. Small wins count.'); bump(); } catch (er) { toast((er as Error).message); }
      }}>
        <input className="input" style={{ minHeight: 40 }} placeholder="One thing that went okay today" value={text} onChange={(e) => setText(e.target.value)} aria-label="One thing that went okay today" />
        <button className="mini-btn mini-btn--hue" type="submit">Save</button>
      </form>
    </Tile>
  );
}

export function AppointmentsWidget() {
  const api = useApi(); const { version } = useRefresh();
  const rows = useLoad(() => api.mother.records('appointments'), [api, version]).data ?? [];
  const next = rows.find((a) => !a.done && a.date >= todayIso()) ?? rows.find((a) => !a.done);
  return <Tile def={def('appointments')}><div className="tile__value">{next ? shortDate(next.date) : 'None'}</div><div className="tile__sub">{next ? next.title : 'Add a follow-up'}</div></Tile>;
}

export function PartnerWidget() {
  const api = useApi(); const toast = useToast(); const { version } = useRefresh();
  const s = useLoad(() => api.mother.partnerPrompts(), [api, version]);
  const on = !!s.data?.enabled;
  return (
    <Tile def={def('partner')}>
      <div className="row row--between" style={{ position: 'relative' }}>
        <div className="tile__value" style={{ fontSize: 'var(--t-lg)' }}>{on ? 'On' : 'Off'}</div>
        <Switch label="Let my partner know when I need rest" checked={on} onChange={async (v) => {
          const r = await api.mother.setPartnerPrompts(v); s.setData(r); toast(v ? 'Your partner gets a kind nudge when you log low rest' : 'Partner nudges turned off');
        }} />
      </div>
      <div className="tile__sub">When you log low rest, your partner gets one kind sentence. Never your scores or words.</div>
    </Tile>
  );
}

export function LetterWidget() {
  const api = useApi();
  const infant = useLoad(() => api.baby.getInfant(), [api]).data;
  return <Tile def={def('letter')}><div className="tile__value">Letter to {infant?.name ?? 'my baby'}</div><div className="tile__sub">Moments and milestones, gathered into a keepsake for their first birthday</div></Tile>;
}

export function LactationWidget() {
  return <Tile def={def('lactation')}><div className="tile__value">Feeding support</div><div className="tile__sub">Track a feed and find trusted support</div></Tile>;
}

export function NutritionWidget() {
  return <Tile def={def('nutrition')}><div className="tile__value">Postpartum nutrition</div><div className="tile__sub">Gentle general guidance and clinician resources</div></Tile>;
}
