// Shown when an action needs a consent the user has not given. One tap turns
// it on (explicitly) and retries; nothing is enabled silently.
import { useState } from 'react';
import type { ConsentPurpose } from '../types';
import { Glass } from './Layout';

export const PURPOSE_LABEL: Record<ConsentPurpose, { title: string; body: string }> = {
  audio_capture: { title: 'Use the microphone', body: 'Record only when you tap. Recordings are analysed and then discarded.' },
  transcription: { title: 'Turn speech into text', body: 'Your words are transcribed so you can review them before anything is saved.' },
  ai_processing: { title: 'Use AI to organise notes', body: 'AI suggests fields or a short summary. You always review it, and it never diagnoses.' },
  storage: { title: 'Save entries', body: 'Keep what you choose to save until you delete it.' },
  sharing: { title: 'Share summaries you approve', body: 'Send a summary you have reviewed, to a person you choose.' },
  research: { title: 'Help improve Embrace', body: 'Optional. Off by default. Nothing is used for research unless you turn this on.' },
};

export function ConsentPrompt({ purposes, onGrant, onCancel }: { purposes: ConsentPurpose[]; onGrant: () => Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Glass variant="glass--caution">
      <div className="stack">
        <h2 className="subtitle">This needs your permission</h2>
        {purposes.map((p) => <p key={p}><strong>{PURPOSE_LABEL[p].title}.</strong> <span className="muted">{PURPOSE_LABEL[p].body}</span></p>)}
        <div className="row wrap">
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await onGrant(); } finally { setBusy(false); } }}>Allow and continue</button>
          <button className="btn btn--ghost" onClick={onCancel}>Not now</button>
        </div>
      </div>
    </Glass>
  );
}
