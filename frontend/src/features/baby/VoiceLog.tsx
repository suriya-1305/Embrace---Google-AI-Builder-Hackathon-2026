// Voice -> transcript -> AI draft -> deterministic validation -> you confirm -> saved.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../state/session';
import { useToast } from '../../state/toast';
import { usePrefs } from '../../state/prefs';
import { BackLink, Glass } from '../../components/Layout';
import { MoonRecorder } from '../../components/MoonRecorder';
import { ConsentPrompt } from '../../components/ConsentPrompt';
import { Field } from '../../components/Controls';
import { EventEditor } from './EventEditor';
import { VOICE_SAMPLES } from '../../lib/samples';
import { AiInfo } from '../../components/AiInfo';
import { ApiError, type ConsentPurpose, type VoiceDraft } from '../../types';

export function VoiceLog() {
  const api = useApi();
  const nav = useNavigate();
  const toast = useToast();
  const { prefs } = usePrefs();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [consent, setConsent] = useState<{ purposes: ConsentPurpose[]; retry: () => void } | null>(null);

  async function submit(input: { audio?: Blob; transcript?: string }) {
    setBusy(true); setDraft(null);
    try { setDraft(await api.baby.voiceLog({ ...input, language: prefs.voiceLanguage })); }
    catch (e) {
      if (e instanceof ApiError && e.code === 'consent_required') setConsent({ purposes: e.purposes ?? [], retry: () => submit(input) });
      else toast((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <>
      <BackLink to="/baby" label="Baby" />
      <div className="stack"><h1 className="title">Say it instead</h1><p className="lede">Describe a feed, sleep or diaper change. You'll check the details before anything is saved.</p></div>

      {consent && <ConsentPrompt purposes={consent.purposes} onCancel={() => setConsent(null)} onGrant={async () => {
        for (const p of consent.purposes) await api.baby.setConsent(p, true);
        const retry = consent.retry; setConsent(null); retry();
      }} />}

      {!draft && (
        <>
          <Glass><MoonRecorder maxSec={20} idleLabel="Tap and speak" purpose="this note" busy={busy} onRecorded={(blob) => submit({ audio: blob })} /></Glass>
          <Glass>
            <form className="stack" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) void submit({ transcript: typed }); }}>
              <Field label="Or type it" htmlFor="typed"><input id="typed" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Changed a wet diaper at 7:15" /></Field>
              <div className="chips">{VOICE_SAMPLES.map((s) => <button type="button" key={s} className="chip" onClick={() => setTyped(s)}>{s}</button>)}</div>
              <button className="btn" type="submit" disabled={busy || !typed.trim()}>{busy ? 'Emi is drafting...' : 'Draft a log with Emi'}</button>
            </form>
          </Glass>
        </>
      )}

      {draft && (
        <Glass>
          <div className="stack stack--lg">
            <div className="stack">
              <span className="faint">Emi heard</span>
              <p style={{ fontSize: 'var(--t-lg)' }}>"{draft.transcript}"</p>
              <div className="row row--between"><span className="faint">Emi's draft, ready to review</span><AiInfo /></div>
            </div>
            {draft.status === 'not_understood' || !draft.draft ? (
              <>
                <p className="callout callout--caution">{draft.message}</p>
                <button className="btn btn--ghost" onClick={() => setDraft(null)}>Try again</button>
              </>
            ) : (
              <>
                {draft.status === 'needs_confirmation' && <p className="callout callout--caution">Check the highlighted details. {draft.missingFields.length ? `Not mentioned: ${draft.missingFields.map((f) => f.replace('startTimeLocal', 'time').replace('durationMin', 'how long').replace('diaperKind', 'diaper kind')).join(', ')}.` : ''}</p>}
                {draft.validationErrors.map((er) => <p key={er} className="callout callout--urgent">{er}</p>)}
                <EventEditor initial={draft.draft} saving={saving} saveLabel="Looks right, save" onSave={async (d) => {
                  if (saving) return;
                  setSaving(true);
                  try { await api.baby.createEvent(d); toast('Saved'); if (mounted.current) nav('/baby'); }
                  catch (e) { toast((e as Error).message); }
                  finally { if (mounted.current) setSaving(false); }
                }} />
                <button className="link-btn" disabled={saving} onClick={() => setDraft(null)}>Discard and start again</button>
              </>
            )}
          </div>
        </Glass>
      )}
    </>
  );
}
