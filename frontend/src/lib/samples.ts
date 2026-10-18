// Synthetic demo recordings. They let the full audio flow (including failure
// cases) be demonstrated without a real baby or a microphone.
import { encodeWav } from './wav';

const RATE = 16000;

function cry(seconds: number, amp: number, noise: number): Float32Array {
  const n = Math.floor(seconds * RATE);
  const out = new Float32Array(n);
  let phase = 0; let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f0 = 450 + 60 * Math.sin(2 * Math.PI * 0.8 * t);
    phase += (2 * Math.PI * f0) / RATE;
    const tone = (Math.sin(phase) + Math.sin(2 * phase) / 2 + Math.sin(3 * phase) / 3) / 1.8;
    const env = t % 1.6 < 1.2 ? Math.min(1, (t % 1.6) * 8) : 0;
    out[i] = amp * tone * env + noise * rand() * 3.4;
  }
  return out;
}

export interface Sample { id: string; label: string; description: string; make: () => Blob; transcript?: string }

export const CRY_SAMPLES: Sample[] = [
  { id: 'clear', label: 'Clear cry', description: 'Close to the phone, quiet room', make: () => encodeWav(cry(7, 0.5, 0), RATE) },
  { id: 'noisy', label: 'Noisy room', description: 'TV and fan in the background', make: () => encodeWav(cry(7, 0.2, 0.09), RATE) },
  { id: 'short', label: 'Too short', description: 'Stopped after a second', make: () => encodeWav(cry(1.2, 0.5, 0), RATE) },
  { id: 'quiet', label: 'Silent room', description: 'Nothing to hear', make: () => encodeWav(new Float32Array(RATE * 6), RATE) },
  { id: 'loud', label: 'Too close', description: 'Distorted, held against the mouth', make: () => encodeWav(cry(7, 2.2, 0).map((x) => Math.max(-1, Math.min(1, x))), RATE) },
];

export const VOICE_SAMPLES = [
  'Fed 90 ml formula at 8 pm',
  'Breastfed on the left side at 6:30',
  'Changed a wet and dirty diaper',
  'She slept for 2 hours',
];

export const JOURNAL_SAMPLE =
  'Today felt long. I slept maybe three hours and my stitches ache when I stand up. My mother came over and held Anya so I could shower, which helped a lot.';
