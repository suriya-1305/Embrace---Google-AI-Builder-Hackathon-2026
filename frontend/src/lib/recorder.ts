// Microphone recorder that produces 16 kHz mono WAV and a live level (0..1)
// for the moon halo. Recording only ever starts from an explicit tap, and it
// stops on tap or automatically at maxSec.
import { encodeWav } from './wav';

export interface Recording { blob: Blob; durationSec: number }
export interface ActiveRecording { stop: () => void; result: Promise<Recording> }

export function micAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.AudioContext !== 'undefined';
}

export async function startRecording(onLevel: (level: number) => void, maxSec: number): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false } });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    let s = 0;
    for (let i = 0; i < data.length; i++) s += data[i] * data[i];
    onLevel(Math.min(1, Math.sqrt(s / data.length) * 4));
  };
  source.connect(processor);
  processor.connect(ctx.destination);

  let resolve!: (r: Recording) => void;
  let reject!: (e: unknown) => void;
  const result = new Promise<Recording>((res, rej) => { resolve = res; reject = rej; });
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    processor.disconnect(); source.disconnect(); stream.getTracks().forEach((t) => t.stop());
    const rate = ctx.sampleRate;
    onLevel(0);
    ctx.close().catch(() => undefined).finally(() => {
      try {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const merged = new Float32Array(total);
        let o = 0;
        chunks.forEach((c) => { merged.set(c, o); o += c.length; });
        const target = 16000;
        const ratio = rate / target;
        const out = new Float32Array(Math.floor(total / ratio));
        for (let i = 0; i < out.length; i++) out[i] = merged[Math.floor(i * ratio)];
        resolve({ blob: encodeWav(out, target), durationSec: out.length / target });
      } catch (e) { reject(e); }
    });
  };
  const timer = window.setTimeout(stop, maxSec * 1000);
  return { stop, result };
}
