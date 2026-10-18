// TypeScript port of backend/crysense/audio/validate.py, used by the mock API
// so the demo behaves exactly like the server.
import type { AudioIssue, AudioQuality } from '../types';

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

export function analyseSamples(samples: Float32Array, rate: number): AudioQuality {
  const duration = rate ? samples.length / rate : 0;
  const issues: AudioIssue[] = [];
  if (duration < 3) issues.push({ code: 'too_short', blocking: true, message: `The recording is ${duration.toFixed(1)} s. Record at least 3 seconds.` });
  if (duration > 30) issues.push({ code: 'too_long', blocking: true, message: 'Keep recordings under 30 seconds.' });

  const win = Math.max(1, Math.floor(rate * 0.05));
  const winDb: number[] = [];
  let sumSq = 0; let peak = 0; let clipped = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); sumSq += samples[i] ** 2; if (a > peak) peak = a; if (a >= 0.999) clipped++; }
  for (let i = 0; i + win <= samples.length; i += win) {
    let s = 0; for (let j = i; j < i + win; j++) s += samples[j] ** 2;
    winDb.push(db(Math.sqrt(s / win)));
  }
  if (!winDb.length) winDb.push(-120);
  const rmsDb = samples.length ? db(Math.sqrt(sumSq / samples.length)) : -120;
  const clipping = samples.length ? clipped / samples.length : 0;
  const silenceRatio = winDb.filter((d) => d < -55).length / winDb.length;
  const activeRatio = winDb.filter((d) => d > -30).length / winDb.length;
  const sorted = [...winDb].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(0.1 * (sorted.length - 1))];

  if (samples.length && silenceRatio > 0.9) issues.push({ code: 'silent', blocking: true, message: 'We could not hear anything. Move closer and try again.' });
  else if (rmsDb < -40) issues.push({ code: 'low_level', blocking: true, message: 'The sound is very quiet. Hold the phone closer.' });
  if (clipping > 0.01) issues.push({ code: 'clipping', blocking: true, message: 'The sound is distorted. Hold the phone a little further away.' });
  if (noiseFloor > -35) issues.push({ code: 'background_noise', blocking: false, message: 'There is a lot of background sound. Results may be less reliable.' });

  const r = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
  return {
    ok: !issues.some((i) => i.blocking), durationSec: r(duration, 2), sampleRate: rate, rmsDb: r(rmsDb), peak: r(peak, 3),
    clippingRatio: r(clipping, 4), silenceRatio: r(silenceRatio, 3), activeRatio: r(activeRatio, 3), noiseFloorDb: r(noiseFloor), issues,
  };
}
