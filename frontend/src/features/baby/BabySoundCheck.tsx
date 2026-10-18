import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useSession } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink } from '../../components/Layout';
import { MoonRecorder } from '../../components/MoonRecorder';
import { SafetyPanel } from '../../components/SafetyPanel';
import { ConsentPrompt } from '../../components/ConsentPrompt';
import { Field } from '../../components/Controls';
import { Sheet } from '../../components/Sheet';
import { Icon } from '../../components/Icon';
import { AiInfo } from '../../components/AiInfo';
import { describeEvent } from '../../components/EventRow';
import { EventEditor, newDraft } from './EventEditor';
import { babyQuestions } from '../../api/mock/logic';
import { CRY_SAMPLES } from '../../lib/samples';
import { config } from '../../config';
import { logDraftKey, removeLogDraft } from '../../state/logDrafts';
import { ApiError, type BabyWarningAnswers, type ConsentPurpose, type CryAnalysis, type EventType, type SafetyResult } from '../../types';

const CHECK_LABELS = { feeding: 'Feeding cues', diaper: 'Diaper comfort', burping: 'After a feed', rest: 'Rest cues', comfort: 'Gentle comfort' };
const SOUND_LABELS = { crying: 'Crying-like sounds', babbling: 'Babbling-like sounds', other_sound: 'Other sounds in the clip', uncertain: 'The sound is unclear' };
const FEATURE_LABELS: Record<string, string> = { repeated_bursts: 'Repeated sound bursts', rising_loudness: 'Increasing loudness', falling_loudness: 'Decreasing loudness', variable_pitch: 'Changing pitch', nasal_tone: 'Nasal-sounding tone', breathy_tone: 'Breathy-sounding tone', pauses: 'Pauses between sounds', background_voice: 'Background voice', uncertain: 'Not clear enough to describe' };
const clipTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
type Step = 'prepare' | 'record' | 'result';

export function BabySoundCheck() {
  const api = useApi();
  const { region, session } = useSession();
  const toast = useToast();
  const infant = useLoad(() => api.baby.getInfant(), [api]);
  const recent = useLoad(() => api.baby.listEvents(1), [api]);
  const [step, setStep] = useState<Step>('prepare');
  const [answers, setAnswers] = useState<BabyWarningAnswers>({});
  const [temperature, setTemperature] = useState('');
  const [safety, setSafety] = useState<SafetyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CryAnalysis | null>(null);
  const [consent, setConsent] = useState<{ purposes: ConsentPurpose[]; retry: () => void } | null>(null);
  const [logType, setLogType] = useState<Extract<EventType, 'feeding' | 'diaper'> | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const booleans = babyQuestions.filter((question) => question.type === 'boolean');
  const selectedSigns = Object.values(answers).some(Boolean) || !!temperature;
  const review = result?.contextReview;
  const hasReview = review?.status === 'ready' || review?.status === 'simulated';
  const logs = (recent.data ?? []).filter((event) => event.syncStatus !== 'pending').slice(-8).reverse();

  async function checkSafety() {
    setBusy(true);
    try {
      const response = await api.baby.warningCheck({ ...answers, tempC: temperature ? Number(temperature) : null }, region);
      setSafety(response);
      if (!response.stopRoutineAnalysis) setStep('record');
    } catch (error) { toast((error as Error).message); }
    finally { setBusy(false); }
  }

  async function analyse(blob: Blob) {
    if (safety?.stopRoutineAnalysis || !safety) return;
    setBusy(true); setAnalysisError('');
    try {
      const permissions = await api.baby.consents();
      const missing = (['audio_capture', 'ai_processing'] as ConsentPurpose[]).filter((purpose) => !permissions[purpose]?.granted);
      if (missing.length) { setConsent({ purposes: missing, retry: () => { void analyse(blob); } }); return; }
      setResult(await api.baby.cryAnalysis(blob));
      setStep('result');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'consent_required') setConsent({ purposes: error.purposes ?? [], retry: () => { void analyse(blob); } });
      else setAnalysisError((error as Error).message);
    } finally { setBusy(false); }
  }

  const suggestions = hasReview && review.suggestions.length
    ? review.suggestions.map((suggestion) => ({ title: CHECK_LABELS[suggestion.category], reason: suggestion.reason }))
    : (result?.nextSteps.checks ?? []).slice(0, 3).map((check) => ({ title: 'From your care log', reason: check.text }));

  return <>
    <BackLink to="/baby" label="Baby care" />
    <div className="page-heading"><span className="eyebrow">{infant.data ? `FOR ${infant.data.name.toUpperCase()}` : 'A MOMENT TO UNDERSTAND'}</span><h1 className="title">Baby sound check</h1><p className="muted">A short recording. Recent care for context. A few things to check.</p></div>
    <ol className="sound-steps" aria-label="Sound check progress">{(['prepare', 'record', 'result'] as Step[]).map((item, index) => <li key={item} aria-current={step === item ? 'step' : undefined}><span>{index + 1}</span>{['Prepare', 'Record', 'Suggestions'][index]}</li>)}</ol>

    {safety && safety.level !== 'none' && <SafetyPanel result={safety} />}

    {step === 'prepare' && !safety?.stopRoutineAnalysis && <section className="sound-section">
      <div className="sound-section__heading"><Icon name="shield" /><h2 className="subtitle">Before recording</h2></div>
      <p>If baby has trouble breathing, looks blue or grey, is hard to wake, or has a seizure, get urgent help instead of recording.</p>
      <details className="sound-details"><summary>Other warning signs or something concerns me</summary><div className="stack">
        <div className="sound-warning-list">{booleans.map((question) => <label className="check" key={question.field}><input type="checkbox" checked={!!answers[question.field as keyof BabyWarningAnswers]} onChange={(event) => setAnswers({ ...answers, [question.field]: event.target.checked })} /><span>{question.label}</span></label>)}</div>
        <Field label="Temperature, if measured (C)" htmlFor="sound-temperature"><input id="sound-temperature" className="input" type="number" step="0.1" min="30" max="45" value={temperature} onChange={(event) => setTemperature(event.target.value)} /></Field>
        <button className="btn btn--soft" disabled={busy} onClick={() => void checkSafety()}>Check these signs</button>
      </div></details>
      <div className="row wrap"><button className="btn" disabled={busy || selectedSigns} onClick={() => void checkSafety()}>{busy ? 'Checking...' : 'No concerning signs - continue'}</button><Link className="link-btn" to="/help">Get help</Link></div>
    </section>}

    {safety?.stopRoutineAnalysis && <section className="sound-section"><p>Pause here and follow the guidance above. A recording should never delay care.</p><Link className="btn btn--soft" to="/help">Support & urgent help</Link></section>}

    {consent && <ConsentPrompt purposes={consent.purposes} onCancel={() => setConsent(null)} onGrant={async () => {
      try { for (const purpose of consent.purposes) await api.baby.setConsent(purpose, true); const retry = consent.retry; setConsent(null); retry(); }
      catch (error) { toast((error as Error).message); }
    }} />}

    {step === 'record' && <>
      <section className="sound-section sound-recording" aria-label="Record baby sounds">
        <h2 className="subtitle">Record 5 to 15 seconds</h2>
        <MoonRecorder maxSec={15} idleLabel="Start recording" purpose="a baby sound check" busy={busy} samples={CRY_SAMPLES} collapseSamples onRecorded={(blob) => { void analyse(blob); }} />
        {busy && <p role="status" aria-live="polite">Emi is reviewing the sound and recent care...</p>}
        {analysisError && <p className="callout callout--caution" role="alert">{analysisError}</p>}
      </section>
      <section className="sound-section"><h2 className="subtitle">Recent care adds context</h2><p className="muted">With your permission, Emi reviews the clip and up to eight recent care logs. Names and private notes are excluded. The server does not keep the audio.</p>
        {config.apiMode === 'mock' && <p className="faint">Emi uses the selected test family's care logs. Shared demo usage limits apply.</p>}
        <details className="sound-details"><summary>Recent care logs ({logs.length})</summary>{recent.error ? <p>Recent logs are unavailable right now.</p> : logs.length ? <ul className="sound-log-list">{logs.map((event) => { const description = describeEvent(event); return <li key={event.id}><strong>{description.title}</strong><span>{new Date(event.startedAt).toLocaleString()}</span></li>; })}</ul> : <p>No saved logs in this window. Missing logs do not mean missing care.</p>}</details>
      </section>
    </>}

    {step === 'result' && result && <>
      <section className="sound-section" aria-label="Sound observations">
        <div className="row row--between"><span className="badge">{review?.provider === 'mock' ? 'Simulated sample result' : review?.status === 'ready' ? 'Sound observations' : 'Recording check'}</span><AiInfo /></div>
        <h2 className="subtitle">{hasReview ? SOUND_LABELS[review.sound] : 'This recording needs another look'}</h2>
        {review?.status === 'unavailable' && <p className="callout" role="status">Emi could not finish this review. No AI sound observations were produced. Care-log checks are still shown below.</p>}
        {hasReview && <p className="muted">Reviewed alongside {review.contextLogCount} recent care {review.contextLogCount === 1 ? 'log' : 'logs'}. This does not establish why your baby is vocalizing.</p>}
        {result.quality.issues.map((issue) => <p className="callout" key={issue.code}>{issue.message}</p>)}
        <details className="sound-details"><summary>Recording details</summary><dl className="sound-metadata"><div><dt>Length</dt><dd>{result.quality.durationSec} seconds</dd></div><div><dt>Sound pattern</dt><dd>{review?.pattern ?? 'uncertain'}</dd></div><div><dt>Pitch</dt><dd>{review?.pitch ?? 'uncertain'}</dd></div><div><dt>Reviewed by</dt><dd>Emi</dd></div><div><dt>Raw audio stored</dt><dd>No</dd></div></dl></details>
      </section>
      {hasReview && <section className="home-section" aria-label="Emi listening notes"><h2 className="subtitle">What Emi heard</h2><p className="muted">{review.explanation || 'A description of the sound, separate from possible care needs.'}</p>{!!review.audibleFeatures?.length && <ul className="listening-features">{review.audibleFeatures.map((feature) => <li key={feature}>{FEATURE_LABELS[feature] ?? 'Uncertain sound feature'}</li>)}</ul>}{!!review.listeningSegments?.length && <div className="listening-timeline">{review.listeningSegments.map((segment, index) => <article className="glass" key={`${segment.startSec}-${index}`}><span className="eyebrow">{clipTime(segment.startSec)} – {clipTime(segment.endSec)}</span><h3 className="item__title">{SOUND_LABELS[segment.sound]}</h3><p className="faint">{segment.pitch} relative pitch · {segment.pattern} pattern · {segment.tone} tone</p></article>)}</div>}<p className="faint">{review.cannotRuleOut || 'Pain or illness cannot be confirmed or excluded by a recording.'}</p></section>}
      <section className="home-section"><h2 className="subtitle">Possible things to check</h2><p className="muted">{review?.disclaimer ?? 'Sound cannot identify hunger, gas, pain or illness. Use these as care checks, not a diagnosis.'}</p><div className="sound-suggestions">{suggestions.map((suggestion, index) => <article className="care-suggestion" key={`${suggestion.title}-${index}`}><span className="care-suggestion__number">{index + 1}</span><div><h3 className="item__title">{suggestion.title}</h3><p>{suggestion.reason}</p></div></article>)}</div></section>
      <section className="sound-section"><h2 className="subtitle">Keep your care log up to date</h2><div className="row wrap"><button className="btn btn--soft" onClick={() => setLogType('feeding')}><Icon name="bottle" />Log a feed</button><button className="btn btn--soft" onClick={() => setLogType('diaper')}><Icon name="drop" />Log a diaper</button></div></section>
      <button className="btn" onClick={() => { setResult(null); setSafety(null); setAnswers({}); setTemperature(''); setStep('prepare'); }}>Check another recording</button>
    </>}

    {logType && <Sheet title={logType === 'feeding' ? 'Log feeding' : 'Log diaper change'} dismissible={!savingLog} onClose={() => setLogType(null)}><EventEditor initial={newDraft(logType)} saving={savingLog} onSave={async (draft) => {
      setSavingLog(true);
      try { const saved = await api.baby.createEvent(draft); if (session?.infantId) removeLogDraft(logDraftKey(session.uid, session.infantId, draft.type)); toast(saved.syncStatus === 'pending' ? 'Saved offline; syncs when you reconnect.' : 'Saved to your care timeline'); setLogType(null); void recent.reload(); }
      catch (error) { toast((error as Error).message); }
      finally { setSavingLog(false); }
    }} /></Sheet>}
  </>;
}