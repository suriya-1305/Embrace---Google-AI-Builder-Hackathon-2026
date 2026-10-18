import { config } from '../config';
import { ApiError, type BabyEvent } from '../types';

export function demoContext(sampleInfantId: string, events: BabyEvent[] = []) {
  const now = Date.now();
  const recentEvents = events.filter((event) => now - new Date(event.startedAt).getTime() <= 86400000 && new Date(event.startedAt).getTime() <= now)
    .sort((first, second) => second.startedAt.localeCompare(first.startedAt)).slice(0, 8).map((event) => {
      const keys = event.type === 'feeding' ? ['method', 'side', 'amountMl'] : event.type === 'sleep' ? ['durationMin'] : ['kind'];
      return { type: event.type, startedAt: event.startedAt, endedAt: event.endedAt ?? null,
        details: Object.fromEntries(keys.filter((key) => event.details[key] != null).map((key) => [key, event.details[key]])) };
    });
  return { sampleInfantId, recentEvents };
}

export async function demoAi<T>(operation: 'sound' | 'voice_log' | 'journal_transcribe' | 'journal_reflect' | 'support_chat' | 'care_document', input: {
  context: ReturnType<typeof demoContext>; audio?: Blob; text?: string; language?: string; image?: Blob; purpose?: 'vaccination' | 'visit';
}): Promise<T> {
  const body = new FormData();
  body.set('context', JSON.stringify(input.context));
  body.set('aiConsent', 'true');
  body.set('audioConsent', input.audio ? 'true' : 'false');
  if (input.audio) body.set('audio', input.audio, 'demo.wav');
  if (input.image) body.set('image', input.image, 'care-document.jpg');
  if (input.purpose) body.set('purpose', input.purpose);
  if (input.text) body.set('text', input.text);
  if (input.language) body.set('language', input.language);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 105000);
  try {
    const base = import.meta.env.DEV ? '/demo-api' : config.demoAiUrl;
    const response = await fetch(`${base}/v1/demo/ai/${operation}`, { method: 'POST', body, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, typeof data.detail === 'string' ? data.detail : 'Emi could not complete the request. Please retry.');
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Emi could not be reached. No simulated result was substituted; reconnect and try again.');
  } finally { window.clearTimeout(timeout); }
}