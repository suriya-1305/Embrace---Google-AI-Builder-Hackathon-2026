// In-browser implementation of the CrySense API (VITE_API_MODE=mock).
// Same document paths, permission rules, consent checks and safety rules as the
// backend, so the demo behaves like the real system with zero infrastructure.
import { ApiError } from '../../types';
import type {
  BabyViewLink, CommunityQuestion, InfantRecordKind, MotherRecordKind, ShareLink, SharedBabyView,
  BabyEvent, CareSummaryPreview, CareSummaryRequest, CheckIn, ConsentMap, ConsentPurpose, CryAnalysis, EventInput, Infant, Instrument,
  FamilyTimelineEvent, JournalEntry, Me, MedicationSchedule, Mother, MotherHome, RecoveryLog, VoiceDraft,
} from '../../types';
import type { CrySenseApi } from '../contract';
import { demoAi, demoContext } from '../demoAi';
import { createDemoCommunityGroups } from './communityGroups';
import { localIso, todayIso } from '../../lib/time';
import { buildSeed, INFANT_ID as DEFAULT_INFANT_ID, MOTHER_ID as DEFAULT_MOTHER_ID, type Doc, type Docs } from './seed';
import {
  observations, vaccineSchedule,
  computeBaseline, demoInstrument, dosesForDay, evaluate, guardReflection, mockExtract, normaliseEvent, scoreScreening,
  sortByTime, suggestChecks, supportContent, validateEvent,
} from './logic';

const KEY = 'crysense.mock.v1';
const PURPOSES: ConsentPurpose[] = ['audio_capture', 'transcription', 'ai_processing', 'storage', 'sharing', 'research'];

let docs: Docs = load();
let community: CommunityQuestion[] = [];

// Minimal client-side mirror of backend/crysense/records.py validation.
const UPSERT: Record<string, (d: Record<string, unknown>) => string> = { hydration: (d) => String(d.date), vaccinations: (d) => String(d.vaccineId), visit_reports: (d) => String(d.clientRequestId) };
function checkRecord(kind: string, d: Record<string, unknown>) {
  const num = (k: string, lo: number, hi: number) => { const v = d[k]; if (v != null && v !== '' && !(Number(v) > lo && Number(v) < hi)) throw new ApiError(422, `Check ${k}: it looks out of range.`, 'invalid_record'); };
  if (kind === 'growth') { num('weightKg', 0.5, 30); num('lengthCm', 30, 120); num('headCm', 20, 60); }
  if (kind === 'hydration' && !(Number(d.glasses) >= 0 && Number(d.glasses) <= 20)) throw new ApiError(422, 'Glasses must be between 0 and 20.', 'invalid_record');
  if ((kind === 'wins' || kind === 'visit_questions') && !String(d.text ?? '').trim()) throw new ApiError(422, 'Write a few words first.', 'invalid_record');
}
const recSort = (rows: Doc[]) => rows.sort((a, b) => String(a.date ?? a.at ?? a.since ?? a.createdAt ?? '').localeCompare(String(b.date ?? b.at ?? b.since ?? b.createdAt ?? '')) || a.id.localeCompare(b.id));

function load(): Docs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...buildSeed(), ...(JSON.parse(raw) as Docs) };
  } catch { /* storage unavailable: fall back to fresh seed */ }
  return buildSeed();
}
function persist() {
  try { window.localStorage.setItem(KEY, JSON.stringify(docs)); } catch { /* best effort */ }
}
const wait = (ms = 260 + Math.random() * 280) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const uid8 = () => Math.random().toString(16).slice(2, 14);

const get = (path: string): Doc | null => (docs[path] ? clone(docs[path]) : null);
const set = (path: string, doc: Doc) => { docs[path] = { ...clone(doc), id: path.split('/').pop() }; persist(); return get(path)!; };
const del = (path: string) => { Object.keys(docs).filter((k) => k === path || k.startsWith(`${path}/`)).forEach((k) => delete docs[k]); persist(); };
const list = (col: string): Doc[] => Object.entries(docs).filter(([k]) => k.slice(0, k.lastIndexOf('/')) === col).map(([, v]) => clone(v)).sort((a, b) => a.id.localeCompare(b.id));
const delCol = (col: string) => { const keys = Object.keys(docs).filter((k) => k.startsWith(`${col}/`)); keys.forEach((k) => delete docs[k]); persist(); return keys.length; };

function audit(actor: string, action: string, subjectId: string, meta: Record<string, unknown> = {}) {
  set(`auditEvents/aud_${uid8()}`, { actor, action, subjectId, meta, at: localIso() });
}
function consentMap(subjectId: string): ConsentMap {
  return Object.fromEntries(PURPOSES.map((p) => [p, get(`consentRecords/${subjectId}_${p}`) ?? { purpose: p, granted: false }])) as ConsentMap;
}
function requireConsent(subjectId: string, ...purposes: ConsentPurpose[]) {
  const state = consentMap(subjectId);
  const missing = purposes.filter((p) => !state[p].granted);
  if (missing.length) throw new ApiError(403, `Turn on ${missing.map((m) => m.replace('_', ' ')).join(', ')} in Settings to use this.`, 'consent_required', missing);
}
function setConsent(subjectType: string, subjectId: string, purpose: ConsentPurpose, granted: boolean, actor: string) {
  const cur = get(`consentRecords/${subjectId}_${purpose}`) ?? {};
  set(`consentRecords/${subjectId}_${purpose}`, { ...cur, subjectType, subjectId, purpose, granted, grantedAt: granted ? localIso() : cur.grantedAt ?? null, revokedAt: granted ? null : localIso(), updatedBy: actor });
  audit(actor, 'consent.updated', subjectId, { purpose, granted });
}

export function createMockApi(uid: string, activeInfantId?: string): CrySenseApi {
  const infantIdsByUser: Record<string, string> = { u_demo30: 'inf_demo30', u_demo4m: 'inf_demo4m', u_demotwins: 'inf_twin_a' };
  const motherIdsByUser: Record<string, string> = { u_demo4m: 'mom_demo4m', u_demotwins: 'mom_demotwins' };
  const INFANT_ID = activeInfantId ?? infantIdsByUser[uid] ?? DEFAULT_INFANT_ID;
  const MOTHER_ID = motherIdsByUser[uid] ?? DEFAULT_MOTHER_ID;
  const infantPath = `infantRecords/${INFANT_ID}`;
  const momPath = `maternalRecords/${MOTHER_ID}`;

  const requireInfant = (): Doc => {
    const inf = get(infantPath);
    if (!inf || !inf.caregiverUids.includes(uid)) throw new ApiError(404, 'Baby profile not found.');
    return inf;
  };
  const requireMother = (): Doc => {
    const m = get(momPath);
    if (!m || m.ownerUid !== uid) throw new ApiError(403, 'This space is private to its owner.');
    return m;
  };
  const events = () => sortByTime(list(`${infantPath}/events`)) as unknown as BabyEvent[];
  const ageDays = (inf: Doc) => Math.floor((Date.now() - new Date(`${inf.birthDate}T00:00:00`).getTime()) / 86400000);
  const familyInfants = () => list('infantRecords').filter((infant) => infant.caregiverUids?.includes(uid));
  const mcol = (n: string) => `${momPath}/${n}`;

  function summarySections(req: CareSummaryRequest): CareSummaryPreview['sections'] {
    const since = new Date(Date.now() - req.periodDays * 86400000).toISOString();
    const recent = (rows: Doc[]) => rows.filter((r) => new Date(r.createdAt).toISOString() >= since);
    const out: CareSummaryPreview['sections'] = [];
    const dash = (v: unknown) => (v == null ? '-' : String(v));
    if (req.fields.includes('checkins')) {
      const rows = recent(sortByTime(list(mcol('checkins')), 'createdAt'));
      out.push({ field: 'checkins', title: 'Daily check-ins', lines: rows.length ? rows.map((c) => `${c.date}: mood ${dash(c.mood)}/5, energy ${dash(c.energy)}/5, rest ${dash(c.rest)}/5, pain ${dash(c.pain)}/10`) : ['No check-ins in this period.'] });
    }
    if (req.fields.includes('recovery')) {
      const rows = recent(sortByTime(list(mcol('recoveryLogs')), 'createdAt'));
      out.push({ field: 'recovery', title: 'Recovery notes', lines: rows.length ? rows.map((r) => `${r.createdAt.slice(0, 10)}: ${r.symptom.replace('_', ' ')}, severity ${r.severity}/10, ${r.trend}`) : ['No recovery notes in this period.'] });
    }
    if (req.fields.includes('medications')) {
      const today = todayIso();
      const meds = list(mcol('medicationSchedules')).filter((s) => s.startDate <= today && (!s.endDate || s.endDate >= today));
      out.push({ field: 'medications', title: 'Medicines (as entered)', lines: meds.length ? meds.map((m) => `${m.name}: ${m.dose} at ${m.times.join(', ')}`) : ['None entered.'] });
    }
    if (req.fields.includes('journal_reflections')) {
      const rows = recent(sortByTime(list(mcol('journalEntries')), 'createdAt')).filter((j) => j.reflection);
      out.push({ field: 'journal_reflections', title: 'Journal reflections (her summaries, not full entries)', lines: rows.length ? rows.map((j) => `${j.createdAt.slice(0, 10)}: ${j.reflection.summary}`) : ['No reflections in this period.'] });
    }
    if (req.fields.includes('screening')) {
      const rows = recent(sortByTime(list(mcol('screenings')), 'createdAt'));
      out.push({ field: 'screening', title: 'Questionnaire results', lines: rows.length ? rows.map((s) => `${s.createdAt.slice(0, 10)}: ${s.instrumentId} v${s.instrumentVersion}, total ${s.total ?? 'not scored'}`) : ['No questionnaires in this period.'] });
    }
    return out;
  }

  return {
    async me(): Promise<Me> {
      await wait(150);
      const u = get(`users/${uid}`);
      if (!u) throw new ApiError(401, 'Sign in to continue.');
      const infants = familyInfants();
      return { uid, displayName: u.displayName, role: u.role, expertVerified: u.expertVerified === true, region: u.region, infantId: infants[0]?.id ?? null, infantIds: infants.map((infant) => infant.id), motherId: get(momPath)?.ownerUid === uid ? MOTHER_ID : null };
    },
    async support(r) { await wait(80); return supportContent(r); },
    async viewSharedBaby(token): Promise<SharedBabyView> {
      await wait(180);
      const [linkPrefix, sharedInfantId, expiresAt] = token.split(':');
      if (linkPrefix !== 'demo-caregiver' || !sharedInfantId || !expiresAt) throw new ApiError(404, 'This viewing link is not valid.');
      if (Number(expiresAt) <= Date.now()) throw new ApiError(410, 'This viewing link has expired.');
      if (!consentMap(sharedInfantId).sharing.granted) throw new ApiError(410, 'Sharing has been turned off for this baby.');
      const sharedInfantPath = `infantRecords/${sharedInfantId}`;
      const infant = get(sharedInfantPath);
      if (!infant) throw new ApiError(410, 'This baby profile is no longer available.');
      const cutoff = Date.now() - 7 * 86400000;
      const rows = (list(`${sharedInfantPath}/events`) as unknown as BabyEvent[]).filter((event) => new Date(event.startedAt).getTime() >= cutoff);
      return {
        infantName: infant.name,
        events: rows.map((event) => ({
          type: event.type, startedAt: event.startedAt, endedAt: event.endedAt,
          details: event.type === 'feeding'
            ? Object.fromEntries(['method', 'side', 'amountMl'].filter((key) => key in event.details).map((key) => [key, event.details[key]]))
            : event.type === 'sleep'
              ? Object.fromEntries(['durationMin'].filter((key) => key in event.details).map((key) => [key, event.details[key]]))
              : Object.fromEntries(['kind'].filter((key) => key in event.details).map((key) => [key, event.details[key]])),
        })),
        expiresAt: new Date(Number(expiresAt)).toISOString(), readOnly: true,
      };
    },
    async reset() { docs = buildSeed(); community = []; persist(); await wait(200); },
    async viewShared(token, payload) {
      await wait(200);
      if (token !== 'inline' || !payload) throw new ApiError(404, 'This link is not valid.');
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const data = JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4)))));
      if (new Date(data.expiresAt).getTime() <= Date.now()) throw new ApiError(410, 'This link has expired. Ask her to share a new one.');
      return data;
    },

    baby: {
      async createProfile() { await wait(); throw new ApiError(409, 'Demo baby profiles are already set up.'); },
      async createProfiles() { await wait(); throw new ApiError(409, 'Demo baby profiles are already set up.'); },
      async syncOfflineEvents() { return 0; },
      async listInfants() { await wait(); return familyInfants().map((infant) => ({ ...infant, ageDays: ageDays(infant) })) as Infant[]; },
      async createViewLink(): Promise<BabyViewLink> { await wait(); requireInfant(); requireConsent(INFANT_ID, 'sharing'); const expiresAt = new Date(Date.now() + 60 * 60000); return { token: `demo-caregiver:${INFANT_ID}:${expiresAt.getTime()}`, expiresAt: expiresAt.toISOString(), ttlMinutes: 60 }; },
      async familyEvents(days = 7) {
        await wait();
        const cutoff = Date.now() - Math.max(1, Math.min(days, 120)) * 86400000;
        const rows: FamilyTimelineEvent[] = [];
        familyInfants().forEach((infant) => {
          (list(`infantRecords/${infant.id}/events`) as unknown as BabyEvent[])
            .filter((event) => new Date(event.startedAt).getTime() >= cutoff)
            .forEach((event) => rows.push({ ...event, infantName: infant.name }));
        });
        return rows.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      },
      async getInfant() { await wait(); const inf = requireInfant(); return { ...inf, ageDays: ageDays(inf) } as Infant; },
      async listEvents(days = 7) {
        await wait(); requireInfant();
        const cutoff = Date.now() - days * 86400000;
        return events().filter((e) => new Date(e.startedAt).getTime() >= cutoff);
      },
      async createEvent(input: EventInput) {
        await wait(); requireInfant();
        const ev = normaliseEvent(input);
        const errors = validateEvent(ev);
        if (errors.length) throw new ApiError(422, errors.join(' '), 'invalid_event');
        const now = localIso();
        return set(`${infantPath}/events/evt_${uid8()}`, { ...ev, infantId: INFANT_ID, createdBy: uid, createdAt: now, updatedAt: now, provenance: ev.provenance ?? { userStated: ['type', 'startedAt'], modelInferred: [] } }) as BabyEvent;
      },
      async updateEvent(id, patch) {
        await wait(); requireInfant();
        const path = `${infantPath}/events/${id}`; const cur = get(path);
        if (!cur) throw new ApiError(404, 'Event not found.');
        const merged = normaliseEvent({ ...cur, ...patch, details: { ...cur.details, ...(patch.details ?? {}) } }) as Doc;
        const errors = validateEvent(merged as EventInput);
        if (errors.length) throw new ApiError(422, errors.join(' '), 'invalid_event');
        const prov = cur.provenance ?? { userStated: [], modelInferred: [] };
        merged.provenance = { userStated: [...new Set([...prov.userStated, ...Object.keys(patch)])].sort(), modelInferred: prov.modelInferred.filter((f: string) => !(f in patch)) };
        return set(path, { ...merged, updatedAt: localIso(), updatedBy: uid }) as BabyEvent;
      },
      async deleteEvent(id) { await wait(); requireInfant(); del(`${infantPath}/events/${id}`); },
      async voiceLog({ audio, transcript, language }): Promise<VoiceDraft> {
        await wait(700); requireInfant();
        requireConsent(INFANT_ID, 'transcription', 'ai_processing', ...(audio ? (['audio_capture'] as ConsentPurpose[]) : []));
        const heard = await demoAi<{ transcript: string; provider: string; extracted: ReturnType<typeof mockExtract> }>('voice_log', { context: demoContext(INFANT_ID), audio, text: transcript, language });
        const x = heard.extracted;
        if (x.eventType === 'unknown') return { transcript: heard.transcript, speechProvider: heard.provider, model: heard.provider, status: 'not_understood', draft: null, missingFields: [], validationErrors: [], message: "That didn't sound like a feed, sleep or diaper change. Try again or log it by hand." };
        const now = new Date(); const inferred: string[] = [];
        let start = new Date(now);
        if (x.startTimeLocal) {
          const [h, m] = x.startTimeLocal.split(':').map(Number); start.setHours(h, m, 0, 0);
          if (start.getTime() > now.getTime() + 300000) { start = new Date(start.getTime() - 86400000); inferred.push('date'); }
        } else inferred.push('startedAt');
        let details: Record<string, unknown> = {}; let ended: string | null = null;
        if (x.eventType === 'feeding') details = { method: x.feedMethod ?? null, amountMl: x.amountMl ?? null, side: x.side ?? null };
        if (x.eventType === 'diaper') details = { kind: x.diaperKind ?? null };
        if (x.eventType === 'sleep' && x.durationMin) {
          let end = new Date(start.getTime() + x.durationMin * 60000);
          if (end > now) { end = now; start = new Date(now.getTime() - x.durationMin * 60000); inferred.push('startedAt'); }
          ended = localIso(end);
        }
        const draft = normaliseEvent({ type: x.eventType as EventInput['type'], startedAt: localIso(start), endedAt: ended, details, source: 'voice', note: null, provenance: { userStated: x.userStatedFields, modelInferred: [...new Set(inferred)].sort() } }) as EventInput;
        const errors = validateEvent(draft);
        return { transcript: heard.transcript, speechProvider: heard.provider, model: heard.provider, status: x.missingFields.length || inferred.length || errors.length ? 'needs_confirmation' : 'ready', draft, missingFields: x.missingFields, validationErrors: errors };
      },
      async warningCheck(answers, r) { await wait(300); const inf = requireInfant(); return evaluate('baby', { ...answers, ageDays: ageDays(inf) }, r); },
      async cryAnalysis(audio): Promise<CryAnalysis> {
        await wait(900); requireInfant(); requireConsent(INFANT_ID, 'audio_capture', 'ai_processing');
        const response = await demoAi<CryAnalysis>('sound', { context: demoContext(INFANT_ID, events()), audio });
        const saved = set(`${infantPath}/audioAnalyses/cry_${uid8()}`, { ...response, createdBy: uid });
        return saved as CryAnalysis;
      },
      async reviewDocument(image, purpose) { requireInfant(); requireConsent(INFANT_ID, 'ai_processing'); return demoAi('care_document', { context: demoContext(INFANT_ID), image, purpose }); },
      async nextSteps() { await wait(); requireInfant(); return suggestChecks(events()); },
      async baseline(days = 7) { await wait(); requireInfant(); return computeBaseline(events(), new Date(), days); },
      async consents() { await wait(150); requireInfant(); return consentMap(INFANT_ID); },
      async setConsent(p, g) { await wait(150); requireInfant(); setConsent('infant', INFANT_ID, p, g, uid); },
      async exportData() { await wait(); const inf = requireInfant(); audit(uid, 'infant.exported', INFANT_ID); return { profile: inf, events: events(), audioAnalyses: list(`${infantPath}/audioAnalyses`), consents: consentMap(INFANT_ID) }; },
      async deleteData() { await wait(); requireInfant(); const removed = { events: delCol(`${infantPath}/events`), audioAnalyses: delCol(`${infantPath}/audioAnalyses`) }; audit(uid, 'infant.data_deleted', INFANT_ID, removed); return { message: 'Baby logs and audio analyses were deleted. The profile was kept.' }; },
      async records(kind: InfantRecordKind) { await wait(180); requireInfant(); return recSort(list(`${infantPath}/${kind}`)) as never; },
      async addRecord(kind: InfantRecordKind, data) {
        await wait(220); requireInfant(); checkRecord(kind, data);
        const id = UPSERT[kind] ? UPSERT[kind](data) : `${kind.slice(0, 3)}_${uid8()}`;
        return set(`${infantPath}/${kind}/${id}`, { ...data, createdBy: uid, createdAt: localIso() }) as never;
      },
      async deleteRecord(kind, id) { await wait(150); requireInfant(); del(`${infantPath}/${kind}/${id}`); },
      async vaccines(r) {
        await wait(200); const inf = requireInfant();
        const given = Object.fromEntries(list(`${infantPath}/vaccinations`).map((v) => [v.vaccineId, v]));
        return vaccineSchedule(r, inf.birthDate, given, todayIso());
      },
      async observations() { await wait(200); requireInfant(); return observations(events()); },
      async nudges() { await wait(150); const infant = requireInfant(); const now = localIso(); return recSort(list(`households/${infant.householdId}/nudges`)).filter((n) => n.forUids.includes(uid) && n.expiresAt > now) as never; },
    },

    mother: {
      async createProfile() { await wait(); throw new ApiError(409, 'Demo mother profiles are already set up.'); },
      async getMother() { await wait(); const m = requireMother(); return { ...m, daysSinceBirth: Math.floor((Date.now() - new Date(`${m.deliveryDate}T00:00:00`).getTime()) / 86400000) } as Mother; },
      async home(): Promise<MotherHome> {
        await wait(); requireMother();
        const checkins = sortByTime(list(mcol('checkins')), 'createdAt') as unknown as CheckIn[];
        const doses = dosesForDay(list(mcol('medicationSchedules')) as unknown as MedicationSchedule[], list(mcol('medicationEvents')), todayIso());
        const rec = sortByTime(list(mcol('recoveryLogs')), 'createdAt') as unknown as RecoveryLog[];
        return { checkedInToday: checkins.some((c) => c.date === todayIso()), lastCheckIn: checkins[checkins.length - 1] ?? null, nextDose: doses.find((d) => d.status === 'due') ?? null, dosesToday: doses.length, journalCount: list(mcol('journalEntries')).length, lastRecovery: rec[rec.length - 1] ?? null };
      },
      async listCheckins() { await wait(); requireMother(); return sortByTime(list(mcol('checkins')), 'createdAt') as unknown as CheckIn[]; },
      async createCheckin(input) {
        await wait(); requireMother();
        const checkin = set(`${mcol('checkins')}/chk_${uid8()}`, { ...input, date: todayIso(), createdAt: localIso() }) as CheckIn;
        const low = (input.rest != null && input.rest <= 2) || (input.energy != null && input.energy <= 2);
        if (low && get(`${mcol('settings')}/partner_prompts`)?.enabled) {
          const m = requireMother();
          set(`households/hh_rao/nudges/ndg_${uid8()}`, { text: `${m.name} could use some rest today. Maybe take the next night feed so she can sleep.`, forUids: ['u_arjun'], createdAt: localIso(), expiresAt: localIso(new Date(Date.now() + 86400000)), source: 'checkin' });
          audit(uid, 'partner_prompt.sent', MOTHER_ID, { recipients: 1 });
        }
        return { checkin, prompt: input.pain != null && input.pain >= 7 ? 'Your pain sounds high today. Would you like to log it in Recovery and check the warning signs?' : null };
      },
      async transcribeJournal({ audio, transcript, language }) {
        requireMother(); requireConsent(MOTHER_ID, 'transcription', 'ai_processing', ...(audio ? (['audio_capture'] as ConsentPurpose[]) : []));
        if (transcript?.trim()) return { transcript: transcript.trim(), provider: 'typed' };
        return demoAi<{ transcript: string; provider: string }>('journal_transcribe', { context: demoContext(INFANT_ID), audio, language });
      },
      async reflect(transcript) { requireMother(); requireConsent(MOTHER_ID, 'ai_processing'); return demoAi('journal_reflect', { context: demoContext(INFANT_ID), text: transcript }); },
      async supportChat(input) { requireMother(); requireConsent(MOTHER_ID, 'ai_processing'); return demoAi('support_chat', { context: demoContext(INFANT_ID), text: JSON.stringify(input) }); },
      async listJournal() { await wait(); requireMother(); return sortByTime(list(mcol('journalEntries')), 'createdAt').reverse() as unknown as JournalEntry[]; },
      async saveJournal(transcript, reflection) {
        await wait(); requireMother(); requireConsent(MOTHER_ID, 'storage');
        return set(`${mcol('journalEntries')}/jrn_${uid8()}`, { createdAt: localIso(), transcript, reflection: reflection ? guardReflection(reflection).reflection : null, reviewedByUser: true, audioRetained: false }) as JournalEntry;
      },
      async deleteJournal(id) { await wait(); requireMother(); del(`${mcol('journalEntries')}/${id}`); audit(uid, 'journal.deleted', MOTHER_ID, { entryId: id }); },
      async listRecovery() { await wait(); requireMother(); return sortByTime(list(mcol('recoveryLogs')), 'createdAt').reverse() as unknown as RecoveryLog[]; },
      async createRecovery(input) { await wait(); requireMother(); return set(`${mcol('recoveryLogs')}/rec_${uid8()}`, { ...input, createdAt: localIso() }) as RecoveryLog; },
      async recoveryCheck(answers) { await wait(300); const m = requireMother(); return evaluate('mother', answers, m.region); },
      async listMedications() {
        await wait(); requireMother(); const today = todayIso();
        return sortByTime(list(mcol('medicationSchedules')), 'createdAt').map((s) => ({ ...s, active: s.startDate <= today && (!s.endDate || s.endDate >= today) })) as MedicationSchedule[];
      },
      async createMedication(input) {
        await wait(); requireMother();
        if (input.instructionsSource !== 'clinician') throw new ApiError(422, 'Enter medicines exactly as your doctor or midwife instructed.');
        if (!input.times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new ApiError(422, 'Times must be HH:MM (24-hour).');
        if (input.endDate && input.endDate < input.startDate) throw new ApiError(422, 'The end date must be after the start date.');
        return set(`${mcol('medicationSchedules')}/med_${uid8()}`, { ...input, times: [...new Set(input.times)].sort(), createdAt: localIso() }) as MedicationSchedule;
      },
      async deleteMedication(id) { await wait(); requireMother(); del(`${mcol('medicationSchedules')}/${id}`); },
      async medicationsToday() {
        await wait(); requireMother();
        return { date: todayIso(), doses: dosesForDay(list(mcol('medicationSchedules')) as unknown as MedicationSchedule[], list(mcol('medicationEvents')), todayIso()), note: 'Reminders follow the instructions you entered. Embrace never changes a dose or a time.' };
      },
      async logDose(scheduleId, scheduledFor, status, rescheduledTo) {
        await wait(200); requireMother();
        const sch = get(`${mcol('medicationSchedules')}/${scheduleId}`);
        if (!sch) throw new ApiError(404, 'Medicine not found.');
        if (!sch.times.includes(scheduledFor.split('T')[1])) throw new ApiError(422, "That time is not in this medicine's schedule.");
        const existing = list(mcol('medicationEvents')).find((e) => e.scheduleId === scheduleId && e.scheduledFor === scheduledFor);
        set(`${mcol('medicationEvents')}/${existing?.id ?? `mev_${uid8()}`}`, { scheduleId, scheduledFor, status, rescheduledTo: rescheduledTo ?? null, at: localIso() });
      },
      async instruments() { await wait(150); return [demoInstrument as unknown as Instrument]; },
      async submitScreening(instrumentId, answers) {
        await wait(400); const m = requireMother();
        if (instrumentId !== demoInstrument.instrumentId) throw new ApiError(404, 'Questionnaire not found.');
        const res = scoreScreening(answers, m.region);
        const saved = set(`${mcol('screenings')}/scr_${uid8()}`, { ...res, support: undefined, answers, createdAt: localIso() });
        return { ...res, id: saved.id };
      },
      async previewSummary(req) { await wait(400); requireMother(); return { recipientName: req.recipientName, recipientRole: req.recipientRole, periodDays: req.periodDays, sections: summarySections(req), generatedAt: localIso(), disclaimer: 'Self-reported information shared by the mother. Not a clinical assessment.' }; },
      async shareSummary(req) {
        await wait(600); requireMother(); requireConsent(MOTHER_ID, 'sharing');
        const preview = { recipientName: req.recipientName, recipientRole: req.recipientRole, periodDays: req.periodDays, sections: summarySections(req), generatedAt: localIso(), disclaimer: 'Self-reported information shared by the mother. Not a clinical assessment.' };
        const saved = set(`${mcol('careSummaries')}/sum_${uid8()}`, { ...preview, status: 'shared_demo', sharedAt: localIso(), delivery: 'Demo only. Connect an approved channel before release.' });
        audit(uid, 'care_summary.shared', MOTHER_ID, { recipientRole: req.recipientRole, fields: req.fields });
        return saved as CareSummaryPreview;
      },
      async consents() { await wait(150); requireMother(); return consentMap(MOTHER_ID); },
      async setConsent(p, g) { await wait(150); requireMother(); setConsent('mother', MOTHER_ID, p, g, uid); },
      async exportData() {
        await wait(); const m = requireMother(); audit(uid, 'mother.exported', MOTHER_ID);
        const names = ['checkins', 'journalEntries', 'screenings', 'recoveryLogs', 'medicationSchedules', 'medicationEvents', 'careSummaries'];
        return { profile: m, ...Object.fromEntries(names.map((n) => [n, list(mcol(n))])), consents: consentMap(MOTHER_ID) };
      },
      async deleteData() {
        await wait(); requireMother();
        const names = ['checkins', 'journalEntries', 'screenings', 'recoveryLogs', 'medicationSchedules', 'medicationEvents', 'careSummaries'];
        const removed = Object.fromEntries(names.map((n) => [n, delCol(mcol(n))]));
        audit(uid, 'mother.data_deleted', MOTHER_ID, removed);
        return { message: 'Your private records were deleted. Your profile was kept.' };
      },
      async records(kind) { await wait(180); requireMother(); return recSort(list(mcol(kind))) as never; },
      async addRecord(kind: MotherRecordKind, data) {
        await wait(200); requireMother(); checkRecord(kind, data);
        const id = UPSERT[kind] ? UPSERT[kind](data) : `${kind.slice(0, 3)}_${uid8()}`;
        return set(`${mcol(kind)}/${id}`, { ...data, createdAt: localIso() }) as never;
      },
      async updateRecord(kind, id, data) {
        await wait(150); requireMother(); checkRecord(kind, data);
        if (!get(`${mcol(kind)}/${id}`)) throw new ApiError(404, 'Not found.');
        return set(`${mcol(kind)}/${id}`, { ...data, createdAt: localIso() }) as never;
      },
      async deleteRecord(kind, id) { await wait(150); requireMother(); del(`${mcol(kind)}/${id}`); },
      async partnerPrompts() { await wait(120); requireMother(); return { enabled: !!get(`${mcol('settings')}/partner_prompts`)?.enabled }; },
      async setPartnerPrompts(enabled) { await wait(150); requireMother(); set(`${mcol('settings')}/partner_prompts`, { enabled }); audit(uid, 'partner_prompt.setting', MOTHER_ID, { enabled }); return { enabled }; },
      async createShareLink(req, ttl): Promise<ShareLink> {
        await wait(400); requireMother(); requireConsent(MOTHER_ID, 'sharing');
        const expiresAt = localIso(new Date(Date.now() + ttl * 60000));
        const summary = { recipientName: req.recipientName, recipientRole: req.recipientRole, periodDays: req.periodDays, sections: summarySections(req), generatedAt: localIso(), disclaimer: 'Self-reported information shared by the mother. Not a clinical assessment.' };
        audit(uid, 'care_summary.link_created', MOTHER_ID, { fields: req.fields, ttlMinutes: ttl });
        // Demo mode has no server, so the (short) summary travels inside the link itself.
        const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ summary, expiresAt })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return { token: 'inline', expiresAt, ttlMinutes: ttl, payload };
      },
    },
    community: {
      groups: createDemoCommunityGroups(uid, { get, set, list, del }),
      async listQuestions(moderation = false) {
        await wait(180);
        if (moderation && uid !== 'moderator') throw new ApiError(403, 'A community moderator must review this action.');
        return community.filter((question) => moderation ? question.status === 'pending' || question.status === 'flagged' : question.status === 'approved');
      },
      async submitQuestion(title, text) {
        await wait(220);
        if (!title.trim() || title.length > 120 || !text.trim() || text.length > 2000) throw new ApiError(422, 'Check the title and question length.');
        const question: CommunityQuestion = { id: `cq_${uid8()}`, title: title.trim(), text: text.trim(), status: 'pending', answer: null, reportCount: 0, createdAt: localIso() };
        community = [question, ...community];
        return question;
      },
      async reviewQuestion(id, status, answer) {
        await wait(180);
        if (uid !== 'moderator') throw new ApiError(403, 'A community moderator must review this action.');
        if (status === 'approved' && get(`users/${uid}`)?.expertVerified !== true) throw new ApiError(403, 'Publishing an expert answer requires verified credentials.');
        if (status === 'approved' && !answer.trim()) throw new ApiError(422, 'Add an expert answer before approval.');
        const question = community.find((item) => item.id === id);
        if (!question) throw new ApiError(404, 'Question not found.');
        Object.assign(question, { status, answer: status === 'approved' ? answer.trim() : null });
        return question;
      },
      async reportQuestion(id) {
        await wait(120);
        const question = community.find((item) => item.id === id && item.status === 'approved');
        if (!question) throw new ApiError(404, 'Question not found.');
        question.reportCount++;
        if (question.reportCount >= 3) question.status = 'flagged';
        return { reported: true };
      },
    },
  };
}
