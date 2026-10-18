// Soothing toolkit: sounds made on the device, a sleep timer, and a record of
// what actually helped. Practical help without claiming to know why a baby cries.
import { useEffect, useState } from 'react';
import { useApi } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { BackLink, Glass } from '../../components/Layout';
import { Segmented } from '../../components/Controls';
import { Icon, type IconName } from '../../components/Icon';
import { playSound, stopSound, type SoundKind } from '../../lib/sound';
import { localIso } from '../../lib/time';
import type { Soothe as S } from '../../types';

const SOUNDS: { k: SoundKind; label: string; icon: IconName }[] = [
  { k: 'shush', label: 'Shush', icon: 'wave' }, { k: 'white', label: 'White noise', icon: 'wave' }, { k: 'pink', label: 'Soft rain', icon: 'drop' },
  { k: 'brown', label: 'Deep hum', icon: 'moon' }, { k: 'heartbeat', label: 'Heartbeat', icon: 'heart' }, { k: 'lullaby', label: 'Lullaby', icon: 'sun' },
];
const TECHNIQUES = ['Holding close, skin to skin', 'Gentle rocking or swaying', 'Swaddle (if age-appropriate)', 'Dim lights and quiet room', 'A walk or change of scene', 'Burping', 'A feed', 'Diaper change'];

export function Soothe() {
  const api = useApi(); const toast = useToast();
  const log = useLoad(() => api.baby.records<S>('soothe'), [api]);
  const [playing, setPlaying] = useState<SoundKind | null>(null);
  const [minutes, setMinutes] = useState('30');
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => () => stopSound(), []);
  useEffect(() => {
    if (!playing) { setLeft(null); return; }
    const end = Date.now() + Number(minutes) * 60000;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(s);
      if (!s) { stopSound(); setPlaying(null); }
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, minutes]);

  const helped = (log.data ?? []).filter((r) => r.helped).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.technique]: (acc[r.technique] ?? 0) + 1 }), {});
  return (
    <>
      <BackLink to="/baby" label="Home" />
      <div className="stack"><h1 className="title">Soothe</h1><p className="lede">Calm sounds made on your phone, and a note of what works for your baby.</p></div>
      <Glass>
        <div className="stack stack--lg">
          <div className="sound-grid">{SOUNDS.map((s) => (
            <button key={s.k} className="sound" aria-pressed={playing === s.k} onClick={() => { if (playing === s.k) { stopSound(); setPlaying(null); } else { playSound(s.k); setPlaying(s.k); } }}>
              <Icon name={s.icon} />{s.label}
            </button>
          ))}</div>
          <Segmented label="Stop after" value={minutes} onChange={setMinutes} options={[{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '60', label: '60 min' }]} />
          {left != null && <p className="faint">Fades out in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. Keep the phone a little away from the cot, at a low volume.</p>}
        </div>
      </Glass>
      <Glass>
        <div className="stack">
          <h2 className="subtitle">What helped this time?</h2>
          <div className="chips">{TECHNIQUES.map((t) => <button key={t} className="chip" onClick={async () => { await api.baby.addRecord('soothe', { technique: t, helped: true, at: localIso() }); toast('Noted'); void log.reload(); }}>{t}</button>)}</div>
          {Object.keys(helped).length > 0 && <>
            <span className="faint" style={{ marginTop: 8 }}>What has helped most so far</span>
            {Object.entries(helped).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([t, n]) => <div key={t} className="row row--between"><span>{t}</span><span className="badge badge--ok">{n}x</span></div>)}
          </>}
        </div>
      </Glass>
    </>
  );
}
