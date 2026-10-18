// TypeScript ports of the backend's deterministic logic. Keep in sync with
// backend/crysense/domain/*, safety/engine.py and screening/engine.py.
import babyRules from '@shared/rules/baby_warning_signs_v1.json';
import momRules from '@shared/rules/mother_recovery_flags_v1.json';
import instrument from '@shared/instruments/demo_wellbeing_v0.json';
import supportJson from '@shared/content/support_v1.json';
import vaccinesIN from '@shared/content/vaccines_IN_v1.json';
import type { Observation, VaccineSchedule, Baseline, BabyEvent, Dose, EventInput, MedicationSchedule, NextSteps, Reflection, Region, SafetyLevel, SafetyResult, ScreeningResult, SupportContent } from '../../types';
import { localIso } from '../../lib/time';
import type { Doc } from './seed';

const byTime = (field = 'startedAt') => (a: Doc, b: Doc) => (a[field] ?? a.createdAt ?? '').localeCompare(b[field] ?? b.createdAt ?? '') || a.id.localeCompare(b.id);
export const sortByTime = <T extends Doc>(docs: T[], field = 'startedAt') => [...docs].sort(byTime(field));
const minutes = (a: string, b: Date | string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

// ---- Events ------------------------------------------------------------------
export function validateEvent(e: Partial<EventInput>, now = new Date()): string[] {
  if (!e.type || !['feeding', 'sleep', 'diaper'].includes(e.type)) return ['Choose feeding, sleep or diaper.'];
  if (!e.startedAt || Number.isNaN(Date.parse(e.startedAt))) return ['Add a valid start time.'];
  const errors: string[] = [];
  if (new Date(e.startedAt).getTime() > now.getTime() + 5 * 60000) errors.push('The time is in the future. Check the time and try again.');
  const d = (e.details ?? {}) as Record<string, unknown>;
  if (e.type === 'feeding') {
    if (d.method != null && !['breast', 'bottle', 'formula', 'expressed'].includes(String(d.method))) errors.push('Feeding method must be breast, bottle, formula or expressed milk.');
    if (d.amountMl != null && !(Number(d.amountMl) > 0 && Number(d.amountMl) <= 400)) errors.push('Amount must be between 1 and 400 ml.');
  } else if (e.type === 'sleep' && e.endedAt) {
    const m = minutes(e.startedAt, e.endedAt);
    if (m <= 0) errors.push('Sleep must end after it starts.');
    else if (m > 960) errors.push('A single sleep longer than 16 hours looks like a typo. Check the times.');
  } else if (e.type === 'diaper' && !['wet', 'dirty', 'both', 'dry'].includes(String(d.kind))) errors.push('Choose wet, dirty, both or dry.');
  return errors;
}
export function normaliseEvent<T extends Partial<EventInput>>(e: T): T {
  if (e.type === 'sleep' && e.startedAt && e.endedAt) return { ...e, details: { ...(e.details ?? {}), durationMin: minutes(e.startedAt, e.endedAt) } };
  return e;
}

// ---- Seven-day baseline (missing days are not zero) --------------------------
export function computeBaseline(events: BabyEvent[], now = new Date(), days = 7): Baseline {
  const key = (d: Date) => localIso(d).slice(0, 10);
  const rows = Array.from({ length: days }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (days - 1 - i));
    return { date: key(d), feeds: 0, sleepMin: 0, wet: 0, dirty: 0, events: 0, hasData: false };
  });
  const index = new Map(rows.map((r) => [r.date, r]));
  const feedTimes: Date[] = [];
  for (const ev of sortByTime(events)) {
    const row = index.get(key(new Date(ev.startedAt)));
    if (!row) continue;
    row.events++;
    if (ev.type === 'feeding') { row.feeds++; feedTimes.push(new Date(ev.startedAt)); }
    if (ev.type === 'sleep') row.sleepMin += Number((ev.details as { durationMin?: number }).durationMin ?? 0);
    if (ev.type === 'diaper') { const k = (ev.details as { kind?: string }).kind; row.wet += +(k === 'wet' || k === 'both'); row.dirty += +(k === 'dirty' || k === 'both'); }
  }
  rows.forEach((r) => { r.hasData = r.events > 0; });
  const logged = rows.filter((r) => r.hasData);
  const complete = logged.filter((r) => r.date !== rows[rows.length - 1].date);
  const basis = complete.length ? complete : logged;
  const avg = (k: 'feeds' | 'sleepMin' | 'wet' | 'dirty') => (basis.length ? Math.round((basis.reduce((s, r) => s + r[k], 0) / basis.length) * 10) / 10 : null);
  const gaps = feedTimes.slice(1).map((t, i) => (t.getTime() - feedTimes[i].getTime()) / 60000).filter((g) => g > 0 && g < 480).sort((a, b) => a - b);
  const median = gaps.length ? (gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2) : null;
  const sleepAvg = avg('sleepMin');
  return {
    windowStart: rows[0].date, windowEnd: rows[rows.length - 1].date, days: rows,
    coverage: { daysWithData: logged.length, totalDays: days, percent: Math.round((100 * logged.length) / days) },
    metrics: { feedsPerDay: avg('feeds'), sleepHoursPerDay: sleepAvg == null ? null : Math.round((sleepAvg / 60) * 10) / 10, wetDiapersPerDay: avg('wet'), dirtyDiapersPerDay: avg('dirty'), typicalFeedGapMin: median == null ? null : Math.round(median), averagedOverDays: basis.length },
    note: 'This describes what was logged. It is not a medical norm, and missing days are not counted as zero.',
  };
}

// ---- What to check next (never a diagnosis) ---------------------------------
export function suggestChecks(events: BabyEvent[], now = new Date()): NextSteps {
  const last = (t: string) => sortByTime(events.filter((e) => e.type === t)).pop();
  const hm = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`;
  const checks: NextSteps['checks'] = [];
  const feed = last('feeding');
  if (feed) { const m = minutes(feed.startedAt, now); checks.push({ id: 'feeding_cues', minutesSince: m, priority: m >= 150 ? 1 : 3, text: `Last feed was ${hm(m)} ago. Look for feeding cues like rooting or hands to mouth.` }); }
  const diaper = last('diaper');
  if (diaper) { const m = minutes(diaper.startedAt, now); checks.push({ id: 'diaper', minutesSince: m, priority: m >= 120 ? 2 : 4, text: `Last diaper change was ${hm(m)} ago. Check the diaper.` }); }
  const sleep = last('sleep');
  if (sleep?.endedAt) { const m = minutes(sleep.endedAt, now); checks.push({ id: 'tiredness', minutesSince: m, priority: m >= 90 ? 2 : 5, text: `Awake for about ${hm(m)}. Try a calm, dim, quiet space.` }); }
  checks.push({ id: 'comfort', minutesSince: null, priority: 6, text: 'Check clothing, temperature and anything that might be uncomfortable.' });
  checks.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { checks: checks.slice(0, 3), guidance: 'Try one thing at a time. If nothing helps and you are worried, get advice. Your judgement comes first.', isDiagnosis: false };
}

// ---- Safety rules ---------------------------------------------------------------
type Cond = { all?: Cond[]; any?: Cond[]; field?: string; op?: string; value?: unknown };
const OPS: Record<string, (a: unknown, b: unknown) => boolean> = {
  eq: (a, b) => a === b, gte: (a, b) => a != null && (a as number) >= (b as number), lt: (a, b) => a != null && (a as number) < (b as number),
};
const matches = (c: Cond, f: Record<string, unknown>): boolean =>
  c.all ? c.all.every((x) => matches(x, f)) : c.any ? c.any.some((x) => matches(x, f)) : OPS[c.op!](f[c.field!], c.value);

export function supportContent(region: Region): SupportContent {
  const regions = supportJson.regions as Record<string, { name: string; emergency: SupportContent['emergency']; support: SupportContent['support'] }>;
  const r = regions[region] ? region : 'IN';
  return { region: r as Region, ...regions[r], overwhelmedGuidance: supportJson.overwhelmedGuidance, version: supportJson.version, verification: supportJson.verification };
}
export function evaluate(which: 'baby' | 'mother', facts: Record<string, unknown>, region: Region): SafetyResult {
  const rs = which === 'baby' ? babyRules : momRules;
  const order = rs.levels as SafetyLevel[];
  const hits = rs.rules.filter((r) => matches(r.when as Cond, facts)).sort((a, b) => order.indexOf(a.level as SafetyLevel) - order.indexOf(b.level as SafetyLevel) || a.id.localeCompare(b.id));
  const level = (hits[0]?.level ?? 'none') as SafetyLevel;
  return {
    level, messages: hits.map((h) => ({ ruleId: h.id, level: h.level as SafetyLevel, text: h.message })),
    stopRoutineAnalysis: ['emergency', 'urgent', 'support_now'].includes(level), rulesetId: rs.rulesetId, rulesetVersion: rs.version, clinicalReview: rs.clinicalReview,
    ...(level !== 'none' ? { support: supportContent(region) } : {}),
  };
}
export const babyQuestions = babyRules.questions;
export const motherQuestions = momRules.questions;

// ---- Questionnaire scoring -------------------------------------------------------
export const demoInstrument = instrument;
export function scoreScreening(answers: Record<string, number | null>, region: Region): ScreeningResult {
  const skipped = instrument.items.map((i) => i.id).filter((id) => answers[id] == null);
  const sv = answers[instrument.safety.itemId];
  const safetyTriggered = sv != null && sv >= instrument.safety.triggerAtOrAbove;
  const res: ScreeningResult = { instrumentId: instrument.instrumentId, instrumentVersion: instrument.version, instrumentStatus: instrument.status, safetyTriggered, skippedItems: skipped, total: null, band: null, followUp: null, bandNote: instrument.bandNote };
  if (skipped.length) res.followUp = "Some questions were skipped, so no total is shown. That's okay. You can come back any time.";
  else {
    const total = instrument.items.reduce((s, i) => s + (answers[i.id] as number), 0);
    const band = instrument.bands.find((b) => b.min <= total && total <= b.max)!;
    Object.assign(res, { total, band: { id: band.id, label: band.label }, followUp: band.followUp });
  }
  if (safetyTriggered) Object.assign(res, { supportNow: true, followUp: 'Thank you for answering honestly. Please reach out for support today. You can see support options now.', support: supportContent(region) });
  return res;
}

// ---- Medication ------------------------------------------------------------------
export function dosesForDay(schedules: MedicationSchedule[], events: Doc[], day: string): Dose[] {
  const slots = new Map(sortByTime(events, 'at').map((e) => [`${e.scheduleId}|${e.scheduledFor}`, e]));
  const out: Dose[] = [];
  [...schedules].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).forEach((s) => {
    if (s.startDate > day || (s.endDate && s.endDate < day)) return;
    [...s.times].sort().forEach((t) => {
      const slot = `${day}T${t}`; const ev = slots.get(`${s.id}|${slot}`);
      out.push({ scheduleId: s.id, name: s.name, dose: s.dose, scheduledFor: slot, status: ev?.status ?? 'due', rescheduledTo: ev?.rescheduledTo ?? null });
    });
  });
  return out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.name.localeCompare(b.name));
}

// ---- Mock "AI": transparent rules, same contract as Gemini --------------------
const TYPE_WORDS: [string, RegExp][] = [
  ['feeding', /\b(fed|feed|feeding|bottle|nursed|breastfed|formula|drank|ml)\b/],
  ['sleep', /\b(slept|sleep|sleeping|nap|napped|asleep)\b/],
  ['diaper', /\b(diaper|nappy|poop|pooped|wet|dirty|changed)\b/],
];
export function mockExtract(transcript: string) {
  const text = transcript.toLowerCase();
  const type = TYPE_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'unknown';
  const stated: string[] = type !== 'unknown' ? ['eventType'] : [];
  const out: Record<string, unknown> = { eventType: type };
  const tm = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (tm) {
    let h = Number(tm[1]); const m = Number(tm[2] ?? 0);
    if (tm[3] === 'pm' && h < 12) h += 12; if (tm[3] === 'am' && h === 12) h = 0;
    if (h <= 23 && m <= 59) { out.startTimeLocal = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; stated.push('startTimeLocal'); }
  }
  if (type === 'feeding') {
    const a = text.match(/(\d{2,3})\s*(ml|mls|millilitres?|milliliters?)\b/); if (a) { out.amountMl = Number(a[1]); stated.push('amountMl'); }
    const method = ['formula', 'bottle', 'breast', 'expressed'].find((w) => text.includes(w)); if (method) { out.feedMethod = method; stated.push('feedMethod'); }
    const side = text.match(/\b(left|right|both)\b/); if (side) { out.side = side[1]; stated.push('side'); }
  }
  if (type === 'sleep') {
    const h = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/); const mi = text.match(/(\d+)\s*(minutes?|mins?)\b/);
    if (h) { out.durationMin = Math.round(Number(h[1]) * 60); stated.push('durationMin'); } else if (mi) { out.durationMin = Number(mi[1]); stated.push('durationMin'); }
  }
  if (type === 'diaper') {
    const wet = /\bwet\b/.test(text); const dirty = /\b(dirty|poop\w*)\b/.test(text);
    if (wet || dirty) { out.diaperKind = wet && dirty ? 'both' : wet ? 'wet' : 'dirty'; stated.push('diaperKind'); }
  }
  const required: Record<string, string[]> = { feeding: ['startTimeLocal'], sleep: ['startTimeLocal', 'durationMin'], diaper: ['diaperKind', 'startTimeLocal'] };
  return { ...out, userStatedFields: stated, missingFields: (required[type] ?? []).filter((f) => out[f] == null) } as {
    eventType: string; startTimeLocal?: string; amountMl?: number; feedMethod?: string; side?: string; durationMin?: number; diaperKind?: string; userStatedFields: string[]; missingFields: string[];
  };
}

const TOPICS: [string, RegExp, string][] = [
  ['sleep', /\b(sleep|slept|tired|exhausted|night|rest)\b/, 'how rest and sleep have been'],
  ['physical_recovery', /\b(stitch\w*|incision|pain|sore|ache\w*|bleed\w*|recover\w*|back)\b/, 'how your body is recovering'],
  ['feeding', /\b(feed\w*|latch\w*|milk|breast\w*|bottle)\b/, 'feeding'],
  ['mood', /\b(sad|happy|cry\w*|overwhelm\w*|anxious|worried|calm|alone|lonely)\b/, 'how you have been feeling'],
  ['support', /\b(help\w*|partner|husband|arjun|mother|mom|amma|family|friend)\b/, 'the support around you'],
  ['baby_care', /\b(baby|anya|diaper|nap)\b/, 'caring for your baby'],
];
const FOLLOW: Record<string, string> = {
  physical_recovery: 'Would you like to log how your recovery feels today?', sleep: 'Would it help to plan one rest window for tomorrow?',
  support: 'Is there one thing you could ask someone to take on this week?', mood: 'Would you like to do a short check-in now?',
  feeding: 'Would you like to note anything about feeding to share with your doctor or midwife?',
};
const BLOCKED = /\b(diagnos\w*|depress\w*|disorder|ppd|postpartum depression|psychosis|suicid\w*|risk score|epds|score of)\b/i;
export function mockReflect(transcript: string): { reflection: Reflection; guardApplied: boolean } {
  const text = transcript.toLowerCase();
  const hits = TOPICS.filter(([, re]) => re.test(text));
  const topics = hits.length ? hits.map((h) => h[0]) : ['other'];
  const phrases = hits.length ? hits.slice(0, 3).map((h) => h[2]) : ['your day'];
  const joined = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
  const reflection: Reflection = { summary: `You talked about ${joined}.`, selfReportedTopics: topics, followUpQuestion: topics.map((t) => FOLLOW[t]).find(Boolean) ?? null, medicalAssessment: false, requiresUserReview: true };
  return guardReflection(reflection);
}
export function guardReflection(r: Reflection): { reflection: Reflection; guardApplied: boolean } {
  if (BLOCKED.test(`${r.summary} ${r.followUpQuestion ?? ''}`)) return { reflection: { ...r, summary: 'Thank you for sharing this. Your words are saved exactly as you reviewed them.', followUpQuestion: null }, guardApplied: true };
  return { reflection: r, guardApplied: false };
}

// ---- Vaccines: schedule + given doses, date arithmetic only -------------------
export function vaccineSchedule(region: Region, birthDate: string, given: Record<string, { givenOn: string }>, today: string): VaccineSchedule {
  if (region !== 'IN') return { region, doses: [], message: 'A schedule for this region has not been added yet.' };
  const birth = new Date(`${birthDate}T12:00:00`);
  const doses = vaccinesIN.doses.map((d) => {
    const due = new Date(birth.getTime() + d.atWeeks * 7 * 86400000);
    const dueDate = localIso(due).slice(0, 10);
    const g = given[d.id];
    return { ...d, dueDate, status: (g ? 'given' : dueDate <= today ? 'due_now' : 'upcoming') as 'given' | 'due_now' | 'upcoming', givenOn: g?.givenOn ?? null };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  return { region: 'IN', version: vaccinesIN.version, verification: vaccinesIN.verification, note: vaccinesIN.verificationNote, doses };
}

// ---- Pattern question cards (port of domain/observations.py) ------------------
export function observations(events: BabyEvent[], now = new Date()): Observation[] {
  const weekAgo = now.getTime() - 7 * 86400000;
  const week = sortByTime(events).filter((e) => new Date(e.startedAt).getTime() >= weekAgo);
  const cards: Observation[] = [];
  const sleeps = week.filter((e) => e.type === 'sleep' && Number((e.details as { durationMin?: number }).durationMin));
  if (sleeps.length) {
    const best = [...sleeps].sort((a, b) => Number((b.details as { durationMin: number }).durationMin) - Number((a.details as { durationMin: number }).durationMin) || a.id.localeCompare(b.id))[0];
    const m = Number((best.details as { durationMin: number }).durationMin);
    const day = new Date(best.startedAt).toLocaleDateString([], { weekday: 'long' });
    cards.push({ id: 'longest_sleep', text: `Longest sleep logged this week: ${Math.floor(m / 60)} h ${m % 60} min, on ${day}.`, question: 'Was anything different that day?' });
  }
  const evening = new Map<string, number>(); const days = new Set<string>();
  week.forEach((e) => {
    const d = new Date(e.startedAt); const key = localIso(d).slice(0, 10); days.add(key);
    if (e.type === 'feeding' && d.getHours() >= 18 && d.getHours() < 22) evening.set(key, (evening.get(key) ?? 0) + 1);
  });
  const busy = [...evening.values()].filter((v) => v >= 2).length;
  if (busy >= 3) cards.push({ id: 'busy_evenings', text: `On ${busy} of the last ${days.size} logged days there were 2 or more feeds between 6 and 10 pm.`, question: 'Do evenings feel busier to you too?' });
  for (let i = 1; i < 7; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    if (!days.has(localIso(d).slice(0, 10))) {
      cards.push({ id: 'gaps', text: `No logs on ${d.toLocaleDateString([], { weekday: 'long' })}. Gaps are shown as gaps, never as zero.`, question: 'Want to add anything you remember from that day?' });
      break;
    }
  }
  return cards;
}
