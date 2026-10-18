// Reminders follow exactly what the mother entered from her clinician's
// instructions. Neither the app nor the AI can change a dose or a time.
import { useState } from 'react';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Field, Loading } from '../../components/Controls';
import { Sheet } from '../../components/Sheet';
import { Icon } from '../../components/Icon';
import { todayIso } from '../../lib/time';
import type { MedicationInput } from '../../types';

const STATUS: Record<string, { label: string; cls: string }> = {
  due: { label: 'Due', cls: 'badge--quiet' }, taken: { label: 'Taken', cls: 'badge--ok' },
  skipped: { label: 'Skipped', cls: 'badge--assumed' }, rescheduled: { label: 'Later', cls: 'badge--assumed' },
};

export function Medicines() {
  const api = useApi();
  const toast = useToast();
  const today = useLoad(() => api.mother.medicationsToday(), [api]);
  const meds = useLoad(() => api.mother.listMedications(), [api]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<MedicationInput>({ name: '', dose: '', times: ['09:00'], startDate: todayIso(), endDate: null, instructionsSource: 'clinician', note: null });
  const [confirmed, setConfirmed] = useState(false);

  async function log(scheduleId: string, slot: string, status: 'taken' | 'skipped' | 'rescheduled') {
    try {
      const later = status === 'rescheduled' ? new Date(Date.now() + 30 * 60000).toTimeString().slice(0, 5) : undefined;
      await api.mother.logDose(scheduleId, slot, status, later);
      toast(status === 'taken' ? 'Marked as taken' : status === 'skipped' ? 'Marked as skipped' : 'Reminder moved by 30 minutes');
      void today.reload();
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><h1 className="title">Medicines</h1><p className="lede">{today.data?.note ?? 'Reminders follow the instructions you entered.'}</p></div>

      <Glass>
        <h2 className="subtitle">Today</h2>
        {!today.data ? <Loading /> : today.data.doses.length ? (
          <div className="list">{today.data.doses.map((d) => (
            <div className="item" key={`${d.scheduleId}${d.scheduledFor}`} style={{ flexWrap: 'wrap' }}>
              <span className="item__icon"><Icon name="pill" /></span>
              <div className="item__body">
                <div className="item__title">{d.name}</div>
                <div className="item__meta">{d.scheduledFor.slice(11)}, {d.dose}{d.rescheduledTo ? `, moved to ${d.rescheduledTo}` : ''}</div>
              </div>
              <span className={`badge ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span>
              {d.status === 'due' && (
                <div className="row" style={{ width: '100%', paddingLeft: 48 }}>
                  <button className="btn btn--small" onClick={() => log(d.scheduleId, d.scheduledFor, 'taken')}>Taken</button>
                  <button className="btn btn--small btn--soft" onClick={() => log(d.scheduleId, d.scheduledFor, 'rescheduled')}>Later</button>
                  <button className="btn btn--small btn--ghost" onClick={() => log(d.scheduleId, d.scheduledFor, 'skipped')}>Skip</button>
                </div>
              )}
            </div>
          ))}</div>
        ) : <p className="empty">No medicines scheduled today.</p>}
      </Glass>

      <Glass>
        <div className="row row--between"><h2 className="subtitle">Your list</h2><button className="btn btn--small btn--soft" onClick={() => setAdding(true)}><Icon name="plus" />Add</button></div>
        {!meds.data ? <Loading /> : (
          <div className="list">{meds.data.map((m) => (
            <div className="item" key={m.id}>
              <div className="item__body"><div className="item__title">{m.name}</div><div className="item__meta">{m.dose} at {m.times.join(', ')}{m.endDate ? `, until ${m.endDate}` : ''}{m.active ? '' : ' (not active)'}</div></div>
              <button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={async () => { await api.mother.deleteMedication(m.id); toast('Removed'); void meds.reload(); void today.reload(); }}><Icon name="trash" /></button>
            </div>
          ))}</div>
        )}
      </Glass>

      {adding && (
        <Sheet title="Add a medicine" onClose={() => setAdding(false)}>
          <form className="stack stack--lg" onSubmit={async (e) => {
            e.preventDefault();
            try { await api.mother.createMedication(form); toast('Added'); setAdding(false); void meds.reload(); void today.reload(); }
            catch (er) { toast((er as Error).message); }
          }}>
            <h2 className="title">Add a medicine</h2>
            <p className="callout">Use exactly what your doctor or midwife prescribed. Embrace reminds you; it does not change your care plan.</p>
            <Field label="Name" htmlFor="mn"><input id="mn" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Dose, as written" htmlFor="md"><input id="md" className="input" required value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} /></Field>
            <Field label="Times" htmlFor="mt" hint="24-hour, separated by commas, e.g. 08:00, 20:00">
              <input id="mt" className="input" value={form.times.join(', ')} onChange={(e) => setForm({ ...form, times: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
            </Field>
            <div className="row">
              <Field label="From" htmlFor="ms"><input id="ms" type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
              <Field label="Until (optional)" htmlFor="me"><input id="me" type="date" className="input" value={form.endDate ?? ''} onChange={(e) => setForm({ ...form, endDate: e.target.value || null })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>These are my clinician's instructions, entered as written.</span></label>
            <button className="btn" type="submit" disabled={!confirmed || !form.name || !form.dose}>Add medicine</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
