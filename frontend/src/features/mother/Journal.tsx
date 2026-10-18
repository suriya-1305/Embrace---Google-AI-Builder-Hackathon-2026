// Record -> transcript you review and edit -> optional AI reflection grounded
// only in your words -> save or discard. Audio is never kept.
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { usePrefs } from '../../state/prefs';
import { BackLink, Glass } from '../../components/Layout';
import { MoonRecorder } from '../../components/MoonRecorder';
import { ConsentPrompt } from '../../components/ConsentPrompt';
import { Field, Loading } from '../../components/Controls';
import { Icon } from '../../components/Icon';
import { AiInfo } from '../../components/AiInfo';
import { JOURNAL_SAMPLE } from '../../lib/samples';
import { dayOf } from '../../lib/time';
import { ApiError, type ConsentPurpose, type Reflection } from '../../types';

type Stage = 'capture' | 'review' | 'reflect';
const TOPIC: Record<string, string> = { sleep: 'Sleep', physical_recovery: 'Recovery', feeding: 'Feeding', mood: 'Feelings', support: 'Support', baby_care: 'Baby care', other: 'Your day' };

export function Journal() {
  const api = useApi();
  const [params] = useSearchParams();
  const toast = useToast();
  const { prefs } = usePrefs();
  const entries = useLoad(() => api.mother.listJournal(), [api]);
  const [stage, setStage] = useState<Stage>('capture');
  const [text, setText] = useState('');
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState<{ purposes: ConsentPurpose[]; retry: () => void } | null>(null);

  async function guarded(fn: () => Promise<void>, retry: () => void) {
    setBusy(true);
    try { await fn(); }
    catch (e) {
      if (e instanceof ApiError && e.code === 'consent_required') setConsent({ purposes: e.purposes ?? [], retry });
      else toast((e as Error).message);
    } finally { setBusy(false); }
  }
  const transcribe = (input: { audio?: Blob; transcript?: string }) =>
    guarded(async () => { const t = await api.mother.transcribeJournal({ ...input, language: prefs.voiceLanguage }); setText(t.transcript); setStage('review'); }, () => transcribe(input));
  const reflect = () => guarded(async () => { const r = await api.mother.reflect(text); setReflection(r.reflection); setStage('reflect'); }, reflect);
  const save = (withReflection: boolean) => guarded(async () => {
    await api.mother.saveJournal(text, withReflection ? reflection : null);
    toast('Saved to your journal'); setStage('capture'); setText(''); setReflection(null); void entries.reload();
  }, () => save(withReflection));
  const discard = () => { setStage('capture'); setText(''); setReflection(null); toast('Discarded. Nothing was saved.'); };

  if (params.get('chat') === '1') return <Navigate to="/me/emi" replace />;

  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><h1 className="title">Voice journal</h1><p className="lede">Talk for up to 90 seconds about anything. You'll see the words first, and you decide what's saved.</p></div>

      {consent && <ConsentPrompt purposes={consent.purposes} onCancel={() => setConsent(null)} onGrant={async () => {
        for (const p of consent.purposes) await api.mother.setConsent(p, true);
        const retry = consent.retry; setConsent(null); retry();
      }} />}

      {stage === 'capture' && (
        <>
          <Glass><MoonRecorder maxSec={90} idleLabel="Tap and talk" purpose="your private journal" busy={busy} onRecorded={(blob) => transcribe({ audio: blob })} /></Glass>
          <Glass>
            <div className="stack">
              <Field label="Or write instead" htmlFor="jt"><textarea id="jt" className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="How was today?" /></Field>
              <div className="row wrap">
                <button className="btn" disabled={busy || !text.trim()} onClick={() => transcribe({ transcript: text })}>Continue</button>
                <button className="btn btn--ghost" onClick={() => setText(JOURNAL_SAMPLE)}>Use a sample entry</button>
              </div>
            </div>
          </Glass>
        </>
      )}

      {stage === 'review' && (
        <Glass>
          <div className="stack stack--lg">
            <div className="row row--between"><span className="faint">Your words, ready to review</span><AiInfo /></div>
            <Field label="Check your words" htmlFor="rev" hint="Fix anything that was misheard. Only what you see here is used.">
              <textarea id="rev" className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <div className="row wrap">
              <button className="btn" disabled={busy || !text.trim()} onClick={reflect}>{busy ? 'Emi is reflecting...' : 'Reflect with Emi'}</button>
              <button className="btn btn--soft" disabled={busy || !text.trim()} onClick={() => save(false)}>Save words only</button>
              <button className="btn btn--ghost" onClick={discard}>Discard</button>
            </div>
          </div>
        </Glass>
      )}

      {stage === 'reflect' && reflection && (
        <Glass variant="glass--tint">
          <div className="stack stack--lg">
            <div className="row row--between"><span className="faint">A reflection from Emi</span><AiInfo /></div>
            <p style={{ fontSize: 'var(--t-lg)', fontFamily: 'var(--font-display)' }}>{reflection.summary}</p>
            <div className="chips">{reflection.selfReportedTopics.map((t) => <span key={t} className="badge badge--quiet">{TOPIC[t] ?? t}</span>)}</div>
            {reflection.followUpQuestion && <p className="callout">{reflection.followUpQuestion}</p>}
            <p className="faint">Written only from what you said. It is not an assessment of your health.</p>
            <div className="row wrap">
              <button className="btn" disabled={busy} onClick={() => save(true)}>Save</button>
              <button className="btn btn--soft" onClick={() => setStage('review')}>Edit my words</button>
              <button className="btn btn--ghost" onClick={discard}>Discard</button>
            </div>
          </div>
        </Glass>
      )}

      <Link className="link-btn" to="/me/emi">Take a quiet moment with Emi</Link>

      <Glass>
        <h2 className="subtitle">Saved entries</h2>
        {!entries.data ? <Loading /> : entries.data.length ? (
          <div className="list">
            {entries.data.map((j) => (
              <div className="item" key={j.id} style={{ alignItems: 'flex-start' }}>
                <div className="item__body">
                  <div className="item__meta">{dayOf(j.createdAt)}</div>
                  <div>{j.reflection?.summary ?? j.transcript.slice(0, 120)}</div>
                </div>
                <button className="icon-btn" aria-label="Delete entry" onClick={async () => { await api.mother.deleteJournal(j.id); toast('Entry deleted'); void entries.reload(); }}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        ) : <p className="empty">Nothing saved yet.</p>}
      </Glass>
    </>
  );
}
