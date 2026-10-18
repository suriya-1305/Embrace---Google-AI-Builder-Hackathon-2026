// 16-bit PCM WAV encode/decode. Recording in WAV keeps the server-side quality
// checks simple and works with Speech-to-Text V2 and Gemini audio input.
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const write = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  write(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); write(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function decodeWav(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buf = await blob.arrayBuffer();
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('This file is not a WAV recording.');
  let offset = 12; let rate = 16000; let channels = 1; let bits = 16;
  while (offset + 8 <= buf.byteLength) {
    const id = tag(offset); const size = v.getUint32(offset + 4, true);
    if (id === 'fmt ') { channels = v.getUint16(offset + 10, true); rate = v.getUint32(offset + 12, true); bits = v.getUint16(offset + 22, true); }
    if (id === 'data') {
      if (bits !== 16) throw new Error('Only 16-bit recordings are supported.');
      const frames = Math.floor(size / 2 / channels);
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += v.getInt16(offset + 8 + (i * channels + c) * 2, true) / 32768;
        out[i] = sum / channels;
      }
      return { samples: out, sampleRate: rate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('No audio data found.');
}
