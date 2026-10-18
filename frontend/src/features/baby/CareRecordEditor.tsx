import { useEffect, useRef, useState } from 'react';
import { useApi, useSession } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { ConsentPrompt } from '../../components/ConsentPrompt';
import { Icon } from '../../components/Icon';
import { todayIso } from '../../lib/time';
import { ApiError, type CareDocumentDraft, type Growth } from '../../types';

async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size > 20_000_000) throw new Error('Choose a photo smaller than 20 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('This browser could not prepare the photo.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob || blob.size > 4_000_000) throw new Error('Try a smaller or more closely cropped photo.');
  return blob;
}

export function CareRecordEditor({ purpose, onSaved, onCancel, onBusyChange }: { purpose: 'vaccination' | 'visit'; onSaved: () => void; onCancel: () => void; onBusyChange?: (busy: boolean) => void }) {
  const api = useApi(); const { region } = useSession(); const toast = useToast();
  const schedule = useLoad(() => api.baby.vaccines(region), [api, region]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayIso());
  const [weight, setWeight] = useState(''); const [length, setLength] = useState(''); const [head, setHead] = useState('');
  const [note, setNote] = useState(''); const [clinician, setClinician] = useState(''); const [nextVisit, setNextVisit] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null); const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]); const [reviewed, setReviewed] = useState(false);
  const [consent, setConsent] = useState(false);
  const reportId = useRef(crypto.randomUUID());
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { if (!photo) return; const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);

  async function readPhoto() {
    if (!photo) return;
    setBusy(true); setError('');
    try {
      const result: CareDocumentDraft = await api.baby.reviewDocument(photo, purpose);
      setEdits((previous) => ({ ...previous, ...Object.fromEntries(result.vaccinations.map((dose) => [dose.vaccineId, dose.givenOn])) }));
      if (purpose === 'visit') { setDate(result.measurementDate ?? ''); setWeight(result.weightKg == null ? '' : String(result.weightKg)); setLength(result.lengthCm == null ? '' : String(result.lengthCm)); setHead(result.headCm == null ? '' : String(result.headCm)); }
      setWarnings(result.warnings); setReviewed(false);
      toast('Draft ready. Check each value against the original.');
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'consent_required') setConsent(true);
      else setError((failure as Error).message);
    } finally { setBusy(false); }
  }

  async function save() {
    if (!reviewed || busy) return;
    setBusy(true); setError('');
    try {
      if (purpose === 'visit' && (weight || length || head)) {
        const measurement = { date, weightKg: weight ? Number(weight) : null, lengthCm: length ? Number(length) : null, headCm: head ? Number(head) : null, note: null };
        const existing = await api.baby.records<Growth>('growth');
        if (!existing.some((row) => row.date === date && row.weightKg === measurement.weightKg && row.lengthCm === measurement.lengthCm && row.headCm === measurement.headCm)) await api.baby.addRecord('growth', measurement);
      }
      for (const [vaccineId, givenOn] of Object.entries(edits)) {
        const previous = schedule.data?.doses.find((dose) => dose.id === vaccineId)?.givenOn;
        if (givenOn && givenOn !== previous) await api.baby.addRecord('vaccinations', { vaccineId, givenOn, note: null });
        else if (!givenOn && previous) await api.baby.deleteRecord('vaccinations', vaccineId);
      }
      if (purpose === 'visit') await api.baby.addRecord('visit_reports', { clientRequestId: reportId.current, date, clinician, note, nextVisitOn: nextVisit || null });
      toast('Care records updated'); onSaved();
    } catch (failure) { setError(`${(failure as Error).message} Some updates may already be saved. Your draft is still here; review and retry.`); }
    finally { setBusy(false); }
  }

  return <form className="stack stack--lg record-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <h2 className="subtitle">{purpose === 'visit' ? 'Add a follow-up report' : 'Edit immunization history'}</h2>
    <div className="record-photo-tools"><label className="btn btn--soft"><Icon name="clipboard" />Capture {purpose === 'visit' ? 'report' : 'card'}<input className="sr-only" type="file" accept="image/*" capture="environment" disabled={busy} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setPhoto(await compressPhoto(file)); setReviewed(false); setError(''); } catch (failure) { setError((failure as Error).message); } }} /></label>
      <label className="btn btn--ghost"><Icon name="share" />Choose photo<input className="sr-only" type="file" accept="image/*" disabled={busy} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setPhoto(await compressPhoto(file)); setReviewed(false); setError(''); } catch (failure) { setError((failure as Error).message); } }} /></label></div>
    {preview && <div className="record-photo-preview"><img src={preview} alt="Document selected for review" /><button className="btn btn--soft" type="button" disabled={busy} onClick={() => void readPhoto()}>{busy ? 'Reading...' : 'Read details with Emi'}</button><p className="faint">Crop out names or IDs you do not want processed. Only a draft is extracted; nothing is saved until you confirm.</p></div>}
    {warnings.map((warning) => <p className="callout" key={warning}>{warning}</p>)}
    {purpose === 'visit' && <>
      <div className="form-grid"><label className="field"><span className="field__label">Visit / measurement date</span><input className="input" type="date" required max={todayIso()} value={date} onChange={(event) => { setDate(event.target.value); setReviewed(false); }} /></label><label className="field"><span className="field__label">Care professional (optional)</span><input className="input" maxLength={100} value={clinician} onChange={(event) => setClinician(event.target.value)} /></label></div>
      <div className="form-grid"><label className="field"><span className="field__label">Weight (kg)</span><input className="input" type="number" min="0.51" max="29.99" step="0.01" value={weight} onChange={(event) => { setWeight(event.target.value); setReviewed(false); }} /></label><label className="field"><span className="field__label">Length / height (cm)</span><input className="input" type="number" min="30.1" max="119.9" step="0.1" value={length} onChange={(event) => { setLength(event.target.value); setReviewed(false); }} /></label><label className="field"><span className="field__label">Head circumference (cm)</span><input className="input" type="number" min="20.1" max="59.9" step="0.1" value={head} onChange={(event) => { setHead(event.target.value); setReviewed(false); }} /></label></div>
      <label className="field"><span className="field__label">Follow-up notes</span><textarea className="textarea" maxLength={1500} value={note} onChange={(event) => setNote(event.target.value)} /></label><label className="field"><span className="field__label">Next appointment (optional)</span><input className="input" type="date" min={date || todayIso()} value={nextVisit} onChange={(event) => setNextVisit(event.target.value)} /></label>
    </>}
    <h3 className="item__title">Vaccine record</h3><p className="faint">Change only confirmed doses and dates. Unchecking a recorded dose removes that history entry.</p>
    {schedule.error ? <p role="alert">{schedule.error.message}</p> : !schedule.data ? <p role="status">Loading vaccine list...</p> : <div className="vaccine-edit-list">{schedule.data.doses.map((dose) => { const value = Object.prototype.hasOwnProperty.call(edits, dose.id) ? edits[dose.id] : dose.givenOn ?? ''; return <div className="vaccine-edit-row" key={dose.id}><label className="check"><input type="checkbox" checked={!!value} onChange={(event) => { setEdits({ ...edits, [dose.id]: event.target.checked ? dose.givenOn ?? todayIso() : '' }); setReviewed(false); }} /><span>{dose.name}</span></label>{value && <input className="input" type="date" aria-label={`${dose.name} given date`} required max={todayIso()} value={value} onChange={(event) => { setEdits({ ...edits, [dose.id]: event.target.value }); setReviewed(false); }} />}</div>; })}</div>}
    <label className="check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I checked these details against the original record.</span></label>
    {error && <p className="callout callout--caution" role="alert">{error}</p>}
    <div className="row wrap"><button className="btn" disabled={busy || !reviewed || !schedule.data}>{busy ? 'Saving...' : 'Save reviewed updates'}</button><button className="btn btn--ghost" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    {consent && <ConsentPrompt purposes={['ai_processing']} onCancel={() => setConsent(false)} onGrant={async () => { try { await api.baby.setConsent('ai_processing', true); setConsent(false); await readPhoto(); } catch (failure) { setError((failure as Error).message); } }} />}
  </form>;
}