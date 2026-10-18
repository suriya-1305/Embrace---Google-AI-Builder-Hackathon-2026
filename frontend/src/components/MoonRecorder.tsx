// The signature control: a glowing moon that breathes while recording and whose
// halo follows the microphone level. Falls back to demo samples when no mic.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { micAvailable, startRecording, type ActiveRecording } from '../lib/recorder';
import type { Sample } from '../lib/samples';

interface Props {
  maxSec: number;
  idleLabel: string;
  onRecorded: (blob: Blob, label: string) => void;
  samples?: Sample[];
  busy?: boolean;
  purpose: string;
  collapseSamples?: boolean;
}

export function MoonRecorder({ maxSec, idleLabel, onRecorded, samples, busy, purpose, collapseSamples = false }: Props) {
  const [state, setState] = useState<'idle' | 'recording'>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<ActiveRecording | null>(null);
  const mounted = useRef(true);
  const hasMic = micAvailable();

  useEffect(() => {
    if (state !== 'recording') return;
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.stop(); };
  }, []);

  async function toggle() {
    if (busy) return;
    if (state === 'recording') { active.current?.stop(); return; }
    setError(null); setElapsed(0);
    try {
      const rec = await startRecording(setLevel, maxSec);
      if (!mounted.current) { rec.stop(); return; }
      active.current = rec; setState('recording');
      const result = await rec.result;
      if (!mounted.current) return;
      active.current = null; setState('idle');
      onRecorded(result.blob, `Your recording (${result.durationSec.toFixed(1)} s)`);
    } catch {
      if (!mounted.current) return;
      setState('idle');
      setError('The microphone is not available. Allow microphone access in your browser, or use a sample below.');
    }
  }

  const label = busy ? 'Working on it' : state === 'recording' ? 'Tap to stop' : idleLabel;
  return (
    <div className="stack" style={{ alignItems: 'stretch' }}>
      <div className="moon-wrap">
        <button type="button" className="moon" data-state={busy ? 'busy' : state} style={{ ['--level' as string]: level }}
          onClick={toggle} disabled={!hasMic || busy} aria-label={hasMic ? label : 'Microphone unavailable'}>
          <span className="moon__halo" aria-hidden="true" /><span className="moon__halo moon__halo--2" aria-hidden="true" />
          <Icon name={state === 'recording' ? 'wave' : 'mic'} />
        </button>
        <div className="stack" style={{ alignItems: 'center', gap: 4 }}>
          {state === 'recording'
            ? <span className="timer" aria-live="polite">0:{String(elapsed).padStart(2, '0')} <span className="faint">/ 0:{String(maxSec).padStart(2, '0')}</span></span>
            : <span className="subtitle" style={{ fontSize: 'var(--t-md)' }}>{label}</span>}
          <span className="faint">{hasMic ? `Recording starts only when you tap. Used for ${purpose}.` : 'No microphone here. Use a sample instead.'}</span>
        </div>
      </div>
      {error && <p className="callout callout--caution" role="alert">{error}</p>}
      {samples && samples.length > 0 && (
        <details className="recorder-samples" open={!collapseSamples}>
          <summary>Try a sample recording</summary>
          <div className="chips">
            {samples.map((s) => (
              <button key={s.id} type="button" className="chip" disabled={busy || state === 'recording'} title={s.description}
                onClick={() => onRecorded(s.make(), `Demo: ${s.label}`)}>{s.label}</button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
