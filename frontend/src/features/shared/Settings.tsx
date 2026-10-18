import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { config } from '../../config';
import { useApi, useSession } from '../../state/session';
import { useTheme, type ThemeMode } from '../../state/theme';
import { useToast } from '../../state/toast';
import { Icon } from '../../components/Icon';
import { useLoad } from '../../state/useLoad';
import { Segmented, Switch } from '../../components/Controls';
import { PURPOSE_LABEL } from '../../components/ConsentPrompt';
import { Sheet } from '../../components/Sheet';
import { Link } from 'react-router-dom';
import { usePrefs, VOICE_LANGUAGES } from '../../state/prefs';
import type { ConsentMap, ConsentPurpose } from '../../types';

const ORDER: ConsentPurpose[] = ['audio_capture', 'transcription', 'ai_processing', 'storage', 'sharing', 'research'];

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ConsentList({ scope }: { scope: 'baby' | 'mother' }) {
  const api = useApi();
  const toast = useToast();
  const [state, setState] = useState<ConsentMap | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); setState(null); api[scope].consents().then(setState).catch(() => setError('Permissions could not load. Please try again when connected.')); }, [api, scope]);
  if (!state) return <p className="faint" role="status">{error || 'Loading permissions...'}</p>;
  return (
    <div className="list">{ORDER.map((p) => (
      <div className="item" key={p}>
        <div className="item__body"><div className="item__title">{PURPOSE_LABEL[p].title}</div><div className="faint">{PURPOSE_LABEL[p].body}</div></div>
        <Switch label={PURPOSE_LABEL[p].title} checked={!!state[p]?.granted} onChange={async (v) => {
          try { await api[scope].setConsent(p, v); setState({ ...state, [p]: { ...state[p], granted: v } }); toast(v ? 'Permission enabled' : 'Permission disabled'); }
          catch (failure) { toast((failure as Error).message); }
        }} />
      </div>
    ))}</div>
  );
}

export function Settings() {
  const api = useApi();
  const { session, signOut } = useSession();
  const { mode, setMode } = useTheme();
  const { prefs, setPrefs } = usePrefs();
  const toast = useToast();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState<'baby' | 'mother' | null>(null);
  const [busy, setBusy] = useState(false);
  const infants = useLoad(() => api.baby.listInfants(), [api]);

  async function exportData(scope: 'baby' | 'mother') {
    try { download(`embrace-${scope}.json`, await api[scope].exportData()); }
    catch (error) { toast((error as Error).message); }
  }

  return (
    <>
      <div className="page-heading"><h1 className="title">Your profile</h1><p className="muted">Your family, preferences and privacy.</p></div>
      <section className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">{session?.displayName?.charAt(0).toUpperCase()}</span>
        <div><h2 className="subtitle">{session?.displayName}</h2><span className="faint">{config.apiMode === 'mock' ? 'Sample family' : session?.role === 'mother' ? 'Mother' : 'Family caregiver'}</span></div>
        <button className="btn btn--small btn--ghost" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await signOut(); nav('/', { replace: true }); }
          catch (error) { toast((error as Error).message); }
          finally { setBusy(false); }
        }}><Icon name="back" />Log out</button>
      </section>
      <div className="profile-shortcuts">
        <Link to="/help" className="profile-action profile-action--help"><Icon name="help" /><span><strong>Get help</strong><small>Urgent concerns & support contacts</small></span><Icon name="back" /></Link>
        <Link to="/modules" className="profile-action"><Icon name="list" /><span><strong>Personalize your home</strong><small>Choose the tools you use</small></span><Icon name="back" /></Link>
      </div>
      <section className="profile-section">
        <h2 className="subtitle">Your family</h2>
        {infants.loading && !infants.data && <p className="faint" role="status">Loading your family...</p>}
        {infants.error && <p className="faint">Family details are unavailable while offline.</p>}
        <div className="family-members">{infants.data?.map((infant) => <div className="family-member" key={infant.id}><Icon name="baby" /><span><strong>{infant.name}</strong><small>Born {new Date(`${infant.birthDate}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</small></span></div>)}</div>
        {session?.motherId && <p className="faint">Your My Space records are private to your account.</p>}
      </section>

      <details className="profile-section">
        <summary><Icon name="sun" />Display & comfort</summary>
        <div className="stack stack--lg">
          <Segmented<ThemeMode> label="Theme" value={mode} onChange={setMode} options={[{ value: 'auto', label: 'Auto' }, { value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }, { value: 'red', label: 'Red light' }]} />
          <div className="row row--between"><span><strong>One-handed mode</strong><br /><span className="faint">Big quick-log buttons within thumb reach</span></span>
            <Switch label="One-handed mode" checked={prefs.oneHanded} onChange={(v) => setPrefs({ oneHanded: v })} /></div>
          <label className="field"><span className="field__label">Voice language</span>
            <select className="select" value={prefs.voiceLanguage} onChange={(e) => setPrefs({ voiceLanguage: e.target.value })}>
              {VOICE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
        </div>
      </details>
      <details className="profile-section">
        <summary><Icon name="shield" />Privacy & permissions</summary>
        <div className="stack stack--lg"><h3 className="item__title">Baby care</h3><ConsentList scope="baby" />
          {session?.motherId && <><h3 className="item__title">My Space</h3><ConsentList scope="mother" /></>}
        </div>
      </details>
      <details className="profile-section">
        <summary><Icon name="download" />Your data</summary>
        <div className="stack">
          <div className="row wrap">
            <button className="btn btn--small btn--soft" onClick={() => void exportData('baby')}><Icon name="download" />Baby records</button>
            {session?.motherId && <button className="btn btn--small btn--soft" onClick={() => void exportData('mother')}><Icon name="download" />My records</button>}
          </div>
          <div className="row wrap">
            <button className="btn btn--small btn--ghost" onClick={() => setConfirm('baby')}>Delete baby logs</button>
            {session?.motherId && <button className="btn btn--small btn--ghost" onClick={() => setConfirm('mother')}>Delete my private records</button>}
          </div>
          {config.apiMode === 'mock' && <button className="link-btn" onClick={async () => { try { await api.reset(); toast('Sample records restored'); } catch (e) { toast((e as Error).message); } }}>Reset sample records</button>}
        </div>
      </details>
      {config.hostedDemo && <a className="link-btn" href="./">Leave sample mode</a>}
      <p className="faint profile-footer">Embrace. Care for baby. Space for you.<br />Not a medical device.</p>

      {confirm && (
        <Sheet title="Confirm delete" onClose={() => setConfirm(null)}>
          <h2 className="title">Delete {confirm === 'baby' ? 'all baby logs' : 'your private records'}?</h2>
          <p className="muted">This removes {confirm === 'baby' ? 'feeds, sleeps, diapers and audio analyses' : 'check-ins, journal, recovery notes, medicines, questionnaires and shared summaries'}. It can't be undone.</p>
          <div className="row wrap">
            <button className="btn btn--urgent" disabled={busy} onClick={async () => {
              setBusy(true);
              try { const response = await api[confirm].deleteData(); toast(response.message); setConfirm(null); }
              catch (error) { toast((error as Error).message); }
              finally { setBusy(false); }
            }}>Delete</button>
            <button className="btn btn--ghost" onClick={() => setConfirm(null)}>Keep my data</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
