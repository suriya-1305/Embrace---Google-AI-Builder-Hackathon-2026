// Soothing sounds generated on the device with Web Audio: no files, no network.
export type SoundKind = 'white' | 'pink' | 'brown' | 'shush' | 'heartbeat' | 'lullaby';
let ctx: AudioContext | null = null;
let stopCurrent: (() => void) | null = null;

function noiseBuffer(c: AudioContext, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  const len = c.sampleRate * 3; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.9; }
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
  }
  return buf;
}

export function stopSound(fadeSec = 0.6) { stopCurrent?.(); stopCurrent = null; void fadeSec; }
export const isPlaying = () => stopCurrent !== null;

export function playSound(kind: SoundKind, volume = 0.35): void {
  stopSound();
  ctx = ctx ?? new AudioContext();
  const c = ctx; void c.resume();
  const out = c.createGain(); out.gain.value = 0; out.connect(c.destination);
  out.gain.linearRampToValueAtTime(volume, c.currentTime + 1.2);
  const nodes: (AudioScheduledSourceNode)[] = [];
  let timer: number | undefined;

  if (kind === 'white' || kind === 'pink' || kind === 'brown' || kind === 'shush') {
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c, kind === 'shush' ? 'white' : kind); src.loop = true;
    if (kind === 'shush') {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.8;
      const swell = c.createGain(); swell.gain.value = 0.6;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.45; const depth = c.createGain(); depth.gain.value = 0.5;
      lfo.connect(depth); depth.connect(swell.gain); src.connect(bp); bp.connect(swell); swell.connect(out); lfo.start(); nodes.push(lfo);
    } else src.connect(out);
    src.start(); nodes.push(src);
  } else if (kind === 'heartbeat') {
    const beat = () => {
      [0, 0.28].forEach((offset, k) => {
        const t = c.currentTime + offset; const o = c.createOscillator(); const g = c.createGain();
        o.frequency.setValueAtTime(k ? 52 : 60, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(k ? 0.7 : 1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25);
      });
    };
    beat(); timer = window.setInterval(beat, 860);
  } else {
    // An original, slow pentatonic phrase (not a copyrighted tune).
    const notes = [392, 440, 523.25, 440, 392, 329.63, 293.66, 329.63, 392, 329.63, 293.66, 261.63];
    let i = 0;
    const play = () => {
      const t = c.currentTime; const o = c.createOscillator(); const g = c.createGain(); o.type = 'sine';
      o.frequency.value = notes[i % notes.length]; i++;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.2);
    };
    play(); timer = window.setInterval(play, 700);
  }
  stopCurrent = () => {
    window.clearInterval(timer);
    const t = c.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.6);
    window.setTimeout(() => { nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }); out.disconnect(); }, 700);
  };
}
