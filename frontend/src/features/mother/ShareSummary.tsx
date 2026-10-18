// The mother picks the recipient and the fields, reads the exact text, then
// shares. Sharing needs its own consent and is written to the audit trail.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useApi } from '../../state/session';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Field, Segmented } from '../../components/Controls';
import { ConsentPrompt } from '../../components/ConsentPrompt';
import { ApiError, type ShareLink, type CareSummaryPreview, type CareSummaryRequest, type ConsentPurpose, type SummaryField } from '../../types';

const FIELDS: { v: SummaryField; label: string }[] = [
  { v: 'checkins', label: 'Daily check-ins' }, { v: 'recovery', label: 'Recovery notes' }, { v: 'medications', label: 'Medicines' },
  { v: 'journal_reflections', label: 'Journal reflections (not full entries)' }, { v: 'screening', label: 'Questionnaire results' },
];

export function ShareSummary() {
  const api = useApi();
  const toast = useToast();
  const [req, setReq] = useState<CareSummaryRequest>({ recipientName: 'Dr. Rao', recipientRole: 'doctor', fields: ['checkins', 'recovery', 'medications'], periodDays: 7 });
  const [preview, setPreview] = useState<CareSummaryPreview | null>(null);
  const [shared, setShared] = useState<CareSummaryPreview | null>(null);
  const [consent, setConsent] = useState<ConsentPurpose[] | null>(null);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!link) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(link.expiresAt).getTime() - Date.now()) / 1000)));
    tick(); const id = window.setInterval(tick, 1000); return () => window.clearInterval(id);
  }, [link]);

  async function showQr() {
    try {
      const l = await api.mother.createShareLink(req, 15);
      const base = `${window.location.origin}${window.location.pathname}`;
      const url = l.token === 'inline' ? `${base}#/shared/inline?d=${l.payload}` : `${base}#/shared/${l.token}`;
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 440, errorCorrectionLevel: 'L' }));
      setLink(l);
    } catch (e) { if (e instanceof ApiError && e.code === 'consent_required') setConsent(e.purposes ?? ['sharing']); else toast((e as Error).message); }
  }
  const toggle = (f: SummaryField) => { setPreview(null); setReq({ ...req, fields: req.fields.includes(f) ? req.fields.filter((x) => x !== f) : [...req.fields, f] }); };

  async function share() {
    try { setShared(await api.mother.shareSummary(req)); toast('Shared'); }
    catch (e) { if (e instanceof ApiError && e.code === 'consent_required') setConsent(e.purposes ?? ['sharing']); else toast((e as Error).message); }
  }

  if (shared) return (
    <>
      <BackLink to="/me" label="My space" />
      <Glass variant="glass--ok"><div className="stack"><h1 className="title">Shared with {shared.recipientName}</h1><p className="muted">Demo only: no message was actually sent. Connect an approved channel before release. This share is recorded in your audit trail.</p></div></Glass>
    </>
  );

  return (
    <>
      <BackLink to="/me" label="My space" />
      <div className="stack"><h1 className="title">Share a summary</h1><p className="lede">You choose who sees it and what's in it. You'll read every word before it's sent.</p></div>
      <Glass>
        <div className="stack stack--lg">
          <Field label="Who is it for" htmlFor="rn"><input id="rn" className="input" value={req.recipientName} onChange={(e) => { setPreview(null); setReq({ ...req, recipientName: e.target.value }); }} /></Field>
          <Segmented label="Role" value={req.recipientRole} onChange={(v) => { setPreview(null); setReq({ ...req, recipientRole: v }); }}
            options={[{ value: 'doctor', label: 'Doctor' }, { value: 'midwife', label: 'Midwife' }, { value: 'partner', label: 'Partner' }, { value: 'family', label: 'Family' }]} />
          <div className="stack">{FIELDS.map((f) => (
            <label className="check" key={f.v}><input type="checkbox" checked={req.fields.includes(f.v)} onChange={() => toggle(f.v)} /><span>{f.label}</span></label>
          ))}</div>
          <Segmented label="Period" value={String(req.periodDays)} onChange={(v) => { setPreview(null); setReq({ ...req, periodDays: Number(v) }); }}
            options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }]} />
          <button className="btn btn--soft" disabled={!req.fields.length || !req.recipientName} onClick={async () => setPreview(await api.mother.previewSummary(req))}>Preview exactly what will be shared</button>
        </div>
      </Glass>

      {preview && (
        <Glass variant="glass--tint">
          <div className="stack stack--lg">
            <h2 className="subtitle">For {preview.recipientName}, last {preview.periodDays} days</h2>
            {preview.sections.map((s) => (
              <div key={s.field} className="stack" style={{ gap: 4 }}>
                <strong>{s.title}</strong>
                <ul style={{ margin: 0, paddingLeft: 18 }} className="small">{s.lines.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            ))}
            <p className="faint">{preview.disclaimer}</p>
            {consent && <ConsentPrompt purposes={consent} onCancel={() => setConsent(null)} onGrant={async () => { for (const p of consent) await api.mother.setConsent(p, true); setConsent(null); await showQr(); }} />}
            {!consent && !link && <div className="row wrap"><button className="btn" onClick={showQr}>Show QR for 15 minutes</button><button className="btn btn--soft" onClick={share}>Send instead</button></div>}
            {link && qr && (
              <div className="qr" data-expired={left === 0}>
                <img src={qr} alt="QR code for the shared summary" />
                <span className="countdown" aria-live="polite">{left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Expired'}</span>
                <span className="faint">{left > 0 ? 'Ask the doctor to scan this. It shows only the fields above and closes on its own.' : 'The link has closed. Nothing more can be seen.'}</span>
                <button className="btn btn--ghost btn--small" onClick={() => { setLink(null); setQr(null); }}>{left > 0 ? 'Hide QR' : 'Done'}</button>
              </div>
            )}
          </div>
        </Glass>
      )}
    </>
  );
}
