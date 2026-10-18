// First-run consent: each purpose is separate, explained plainly, and changeable later.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useSession } from '../../state/session';
import { Glass } from '../../components/Layout';
import { Switch } from '../../components/Controls';
import { PURPOSE_LABEL } from '../../components/ConsentPrompt';
import type { ConsentMap, ConsentPurpose } from '../../types';

const ORDER: ConsentPurpose[] = ['audio_capture', 'transcription', 'ai_processing', 'storage', 'sharing', 'research'];

export function Permissions() {
  const api = useApi();
  const { session } = useSession();
  const nav = useNavigate();
  const [state, setState] = useState<ConsentMap | null>(null);
  useEffect(() => { api.baby.consents().then(setState).catch(() => setState(null)); }, [api]);

  async function toggle(p: ConsentPurpose, v: boolean) {
    await api.baby.setConsent(p, v);
    if (session?.motherId) await api.mother.setConsent(p, v).catch(() => undefined);
    setState((s) => (s ? { ...s, [p]: { ...s[p], granted: v } } : s));
  }
  function done() {
    try { if (session) window.localStorage.setItem(`crysense.permissions.v1.${session.uid}`, 'yes'); } catch { /* ignore */ }
    nav('/baby');
  }

  return (
    <div className="stack stack--lg">
      <div className="stack">
        <h1 className="title">You choose what to share</h1>
        <p className="lede">Each permission is separate. You can change any of them later in Settings.</p>
      </div>
      <Glass>
        <div className="list">
          {ORDER.map((p) => (
            <div className="item" key={p}>
              <div className="item__body"><div className="item__title">{PURPOSE_LABEL[p].title}</div><div className="faint">{PURPOSE_LABEL[p].body}</div></div>
              <Switch checked={!!state?.[p]?.granted} onChange={(v) => toggle(p, v)} label={PURPOSE_LABEL[p].title} />
            </div>
          ))}
        </div>
      </Glass>
      <button className="btn btn--block" onClick={done}>Continue</button>
    </div>
  );
}
