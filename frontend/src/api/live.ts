// HTTP client for the two Cloud Run services. The browser never holds API keys:
// it sends only the signed-in user's ID token.
import { config } from '../config';
import { ApiError } from '../types';
import type { BabyEvent, CommunityQuestion, EventInput, FamilyTimelineEvent, Infant, SharedBabyView } from '../types';
import type { ApiContext, CrySenseApi } from './contract';
import { listOfflineEvents, queueOfflineEvent, removeOfflineEvent, type QueuedEvent } from '../lib/offlineEvents';

async function call<T>(base: string, path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Embrace could not connect. Please try again when you are online.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.detail;
    if (detail && typeof detail === 'object') {
      const msg = detail.message ?? (Array.isArray(detail.errors) ? detail.errors.join(' ') : 'Something went wrong.');
      throw new ApiError(res.status, msg, detail.code, detail.purposes);
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : 'Something went wrong. Try again.');
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(data) });
function form(fields: Record<string, Blob | string | undefined>): FormData {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined) return;
    if (v instanceof Blob) fd.append(k, v, `${k}.wav`);
    else fd.append(k, v);
  });
  return fd;
}

export function createLiveApi(ctx: ApiContext): CrySenseApi {
  const B = config.babyApiUrl;
  const M = config.motherApiUrl;
  const t = ctx.token;
  const inf = () => `/v1/infants/${ctx.infantId}`;
  const mom = () => `/v1/mothers/${ctx.motherId}`;
  const need = (id: string | null, label: string) => { if (!id) throw new ApiError(403, `${label} is not available for this account.`); };
  const pendingEvent = (queued: QueuedEvent) => ({
    ...queued.input,
    id: `evt_${queued.id}`,
    infantId: queued.infantId,
    createdBy: ctx.uid,
    createdAt: queued.queuedAt,
    updatedAt: queued.queuedAt,
    syncStatus: 'pending' as const,
  });
  async function syncOfflineEvents(): Promise<number> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
    const queued = await listOfflineEvents(ctx.uid);
    let synced = 0;
    for (const event of queued) {
      try {
        await call(B, `/v1/infants/${event.infantId}/events`, t, json({ ...event.input, clientRequestId: event.id }));
        await removeOfflineEvent(event.id);
        synced++;
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) break;
        throw error;
      }
    }
    return synced;
  }
  async function listQueuedEvents(infantId?: string) {
    const queued = await listOfflineEvents(ctx.uid, infantId);
    return queued.map((event) => pendingEvent(event));
  }
  async function createEvent(input: EventInput): Promise<BabyEvent> {
    const infantId = ctx.infantId;
    need(infantId, 'Baby care');
    const clientRequestId = input.clientRequestId ?? crypto.randomUUID();
    const request = { ...input, clientRequestId };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const id = await queueOfflineEvent(ctx.uid, infantId!, request);
      return pendingEvent({ id, infantId: infantId!, queuedAt: new Date().toISOString(), input: request });
    }
    try {
      return await call<BabyEvent>(B, `${inf()}/events`, t, json(request));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 0) throw error;
      const id = await queueOfflineEvent(ctx.uid, infantId!, request);
      return pendingEvent({ id, infantId: infantId!, queuedAt: new Date().toISOString(), input: request });
    }
  }

  return {
    me: () => call(B, '/v1/me', t),
    support: (region) => call(B, `/v1/support?region=${region}`, null),
    viewShared: (token) => call(M, `/v1/shared/${token}`, null),
    viewSharedBaby: (token) => call<SharedBabyView>(B, `/v1/shared-infants/${encodeURIComponent(token)}`, null),
    reset: async () => { await call(B, '/v1/dev/reset', null, { method: 'POST' }); await call(M, '/v1/dev/reset', null, { method: 'POST' }); },
    baby: {
      createProfile: (input) => call(B, '/v1/onboarding/baby', t, json(input)),
      createProfiles: (input) => call(B, '/v1/onboarding/babies', t, json(input)),
      listInfants: () => call(B, '/v1/infants', t),
      createViewLink: (ttlMinutes = 60) => {
        need(ctx.infantId, 'Baby care');
        return call(B, `${inf()}/view-links?ttlMinutes=${ttlMinutes}`, t, json({}));
      },
      familyEvents: async (days = 7) => {
        await syncOfflineEvents().catch(() => 0);
        let remote: FamilyTimelineEvent[] = [];
        let infants: Infant[] = [];
        try {
          remote = await call<FamilyTimelineEvent[]>(B, `/v1/family/events?days=${days}`, t);
          infants = await call<Infant[]>(B, '/v1/infants', t);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 0) throw error;
        }
        const names = new Map(infants.map((infant) => [infant.id, infant.name]));
        const cutoff = Date.now() - days * 86400000;
        const pending = (await listOfflineEvents(ctx.uid)).map((event) => ({
          ...pendingEvent(event),
          infantName: names.get(event.infantId) ?? 'Pending sync',
        })).filter((event) => new Date(event.startedAt).getTime() >= cutoff);
        return [...remote, ...pending].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      },
      getInfant: () => { need(ctx.infantId, 'Baby care'); return call(B, inf(), t); },
      listEvents: async (days = 7) => {
        need(ctx.infantId, 'Baby care');
        await syncOfflineEvents().catch(() => 0);
        let remote: BabyEvent[] = [];
        try {
          remote = await call<BabyEvent[]>(B, `${inf()}/events?days=${days}`, t);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 0) throw error;
        }
        const cutoff = Date.now() - days * 86400000;
        const pending = (await listQueuedEvents(ctx.infantId ?? undefined))
          .filter((event) => new Date(event.startedAt).getTime() >= cutoff);
        return [...remote, ...pending].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      },
      createEvent,
      syncOfflineEvents,
      updateEvent: (id, patch) => call(B, `${inf()}/events/${id}`, t, { method: 'PATCH', body: JSON.stringify(patch) }),
      deleteEvent: (id) => call(B, `${inf()}/events/${id}`, t, { method: 'DELETE' }),
      voiceLog: ({ audio, transcript, language }) => call(B, `${inf()}/voice-log`, t, { method: 'POST', body: form({ audio, transcript, language }) }),
      warningCheck: (answers, region) => call(B, `${inf()}/warning-check?region=${region}`, t, json(answers)),
      cryAnalysis: (audio) => call(B, `${inf()}/cry-analysis`, t, { method: 'POST', body: form({ audio }) }),
      reviewDocument: (image, purpose) => call(B, `${inf()}/documents/review`, t, { method: 'POST', body: form({ image, purpose }) }),
      nextSteps: () => call(B, `${inf()}/next-steps`, t),
      baseline: (days = 7) => call(B, `${inf()}/baseline?days=${days}`, t),
      consents: () => call(B, `${inf()}/consents`, t),
      setConsent: (purpose, granted) => call(B, `${inf()}/consents/${purpose}`, t, { method: 'PUT', body: JSON.stringify({ granted }) }),
      exportData: () => call(B, `${inf()}/export`, t),
      deleteData: () => call(B, `${inf()}/data`, t, { method: 'DELETE' }),
      records: (kind) => call(B, `${inf()}/records/${kind}`, t),
      addRecord: (kind, data) => call(B, `${inf()}/records/${kind}`, t, json(data)),
      deleteRecord: (kind, id) => call(B, `${inf()}/records/${kind}/${id}`, t, { method: 'DELETE' }),
      vaccines: (region) => call(B, `${inf()}/vaccines?region=${region}`, t),
      observations: () => call(B, `${inf()}/observations`, t),
      nudges: () => call(B, `${inf()}/nudges`, t),
    },
    mother: {
      createProfile: (input) => call(M, '/v1/onboarding/mother', t, json(input)),
      getMother: () => { need(ctx.motherId, 'This private space'); return call(M, mom(), t); },
      home: () => call(M, `${mom()}/home`, t),
      listCheckins: () => call(M, `${mom()}/checkins`, t),
      createCheckin: (input) => call(M, `${mom()}/checkins`, t, json(input)),
      transcribeJournal: ({ audio, transcript, language }) => call(M, `${mom()}/journal/transcribe`, t, { method: 'POST', body: form({ audio, transcript, language }) }),
      reflect: (transcript) => call(M, `${mom()}/journal/reflect`, t, json({ transcript })),
      supportChat: (input) => call(M, `${mom()}/support/chat`, t, json(input)),
      listJournal: () => call(M, `${mom()}/journal`, t),
      saveJournal: (transcript, reflection) => call(M, `${mom()}/journal`, t, json({ transcript, reflection, reviewedByUser: true })),
      deleteJournal: (id) => call(M, `${mom()}/journal/${id}`, t, { method: 'DELETE' }),
      listRecovery: () => call(M, `${mom()}/recovery`, t),
      createRecovery: (input) => call(M, `${mom()}/recovery`, t, json(input)),
      recoveryCheck: (answers) => call(M, `${mom()}/recovery/check`, t, json(answers)),
      listMedications: () => call(M, `${mom()}/medications`, t),
      createMedication: (input) => call(M, `${mom()}/medications`, t, json(input)),
      deleteMedication: (id) => call(M, `${mom()}/medications/${id}`, t, { method: 'DELETE' }),
      medicationsToday: () => call(M, `${mom()}/medications/today`, t),
      logDose: (scheduleId, scheduledFor, status, rescheduledTo) =>
        call(M, `${mom()}/medications/${scheduleId}/events`, t, json({ scheduledFor, status, rescheduledTo })),
      instruments: () => call(M, '/v1/screening/instruments', t),
      submitScreening: (instrumentId, answers) => call(M, `${mom()}/screenings`, t, json({ instrumentId, answers })),
      previewSummary: (req) => call(M, `${mom()}/care-summaries/preview`, t, json(req)),
      shareSummary: (req) => call(M, `${mom()}/care-summaries`, t, json(req)),
      consents: () => call(M, `${mom()}/consents`, t),
      setConsent: (purpose, granted) => call(M, `${mom()}/consents/${purpose}`, t, { method: 'PUT', body: JSON.stringify({ granted }) }),
      exportData: () => call(M, `${mom()}/export`, t),
      deleteData: () => call(M, `${mom()}/data`, t, { method: 'DELETE' }),
      records: (kind) => call(M, `${mom()}/records/${kind}`, t),
      addRecord: (kind, data) => call(M, `${mom()}/records/${kind}`, t, json(data)),
      updateRecord: (kind, id, data) => call(M, `${mom()}/records/${kind}/${id}`, t, { method: 'PUT', body: JSON.stringify(data) }),
      deleteRecord: (kind, id) => call(M, `${mom()}/records/${kind}/${id}`, t, { method: 'DELETE' }),
      partnerPrompts: () => call(M, `${mom()}/partner-prompts`, t),
      setPartnerPrompts: (enabled) => call(M, `${mom()}/partner-prompts`, t, { method: 'PUT', body: JSON.stringify({ enabled }) }),
      createShareLink: (req, ttl) => call(M, `${mom()}/care-summaries/share-link?ttlMinutes=${ttl}`, t, json(req)),
    },
    community: {
      groups: {
        list: () => call(B, '/v1/community/groups', t),
        join: (groupId, displayName) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/membership`, t, json({ displayName })),
        leave: (groupId) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/membership`, t, { method: 'DELETE' }),
        posts: (groupId, page = 0, moderation = false) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts?page=${page}&moderation=${moderation}`, t),
        post: (groupId, input) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts`, t, json(input)),
        replies: (groupId, postId, moderation = false) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/replies?moderation=${moderation}`, t),
        reply: (groupId, postId, text) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/replies`, t, json({ text })),
        deletePost: (groupId, postId) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}`, t, { method: 'DELETE' }),
        deleteReply: (groupId, postId, replyId) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}`, t, { method: 'DELETE' }),
        report: (groupId, postId, replyId) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/report`, t, json({ replyId })),
        block: (groupId, postId, replyId) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/block`, t, json({ replyId })),
        review: (groupId, postId, status, replyId) => call(B, `/v1/community/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/moderation`, t, { method: 'PUT', body: JSON.stringify({ status, replyId }) }),
      },
      listQuestions: (moderation = false) => call<CommunityQuestion[]>(B, `/v1/community/questions${moderation ? '?moderation=true' : ''}`, t),
      submitQuestion: (title, text) => call(B, '/v1/community/questions', t, json({ title, text })),
      reviewQuestion: (id, status, answer) => call(B, `/v1/community/questions/${encodeURIComponent(id)}/moderation`, t, { method: 'PUT', body: JSON.stringify({ status, answer }) }),
      reportQuestion: (id) => call(B, `/v1/community/questions/${encodeURIComponent(id)}/reports`, t, json({})),
    },
  };
}
