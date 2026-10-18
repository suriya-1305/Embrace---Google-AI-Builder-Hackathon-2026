// Port of backend/crysense/store/seed.py. Fictional data relative to "now".
// Day 3 is intentionally empty so the seven-day view shows missing data honestly.
import { localIso } from '../../lib/time';

export type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Docs = Record<string, Doc>;

export const INFANT_ID = 'inf_anya';
export const MOTHER_ID = 'mom_meera';
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const addDays = (d: Date, n: number) => addMin(d, n * 1440);
const dateOnly = (d: Date) => localIso(d).slice(0, 10);

export function buildSeed(nowIn = new Date()): Docs {
  const now = new Date(nowIn); now.setSeconds(0, 0);
  const birth = addDays(now, -42);
  const docs: Docs = {};
  const set = (path: string, doc: Doc) => { docs[path] = { ...doc, id: path.split('/').pop() }; };

  set('users/u_meera', { displayName: 'Meera', role: 'mother', region: 'IN', householdId: 'hh_rao' });
  set('users/u_arjun', { displayName: 'Arjun', role: 'partner', region: 'IN', householdId: 'hh_rao' });
  set('households/hh_rao', { name: 'Rao household', memberUids: ['u_meera', 'u_arjun'], sharingPermissions: { u_arjun: { infant: true, mother: false } } });
  set(`infantRecords/${INFANT_ID}`, { name: 'Anya', birthDate: dateOnly(birth), householdId: 'hh_rao', caregiverUids: ['u_meera', 'u_arjun'], timezone: 'Asia/Kolkata' });
  set(`maternalRecords/${MOTHER_ID}`, { name: 'Meera', ownerUid: 'u_meera', deliveryDate: dateOnly(birth), deliveryType: 'caesarean', region: 'IN', timezone: 'Asia/Kolkata' });

  let n = 0;
  const feedHours = [1, 4, 7, 10, 13, 16, 19, 22];
  const amounts = [80, 90, 70, 100, 90, 85, 95, 90];
  const pad = (k: number) => String(k).padStart(4, '0');
  for (let offset = 6; offset >= 0; offset--) {
    if (offset === 3) continue;
    const day = addDays(now, -offset); day.setHours(0, 0, 0, 0);
    feedHours.forEach((h, i) => {
      const t = addMin(day, h * 60 + ((offset * 7 + i * 3) % 25));
      if (t > now) return;
      n++;
      const breast = i % 3 === 0;
      set(`infantRecords/${INFANT_ID}/events/evt_${pad(n)}`, {
        infantId: INFANT_ID, type: 'feeding', startedAt: localIso(t), endedAt: null,
        details: { method: breast ? 'breast' : 'bottle', amountMl: breast ? null : amounts[i], side: breast ? (i % 2 ? 'left' : 'right') : null },
        source: 'manual', createdBy: i % 2 ? 'u_meera' : 'u_arjun', provenance: { userStated: ['type', 'time'], modelInferred: [] },
        createdAt: localIso(t), updatedAt: localIso(t),
      });
      if (i % 2 === 0) {
        n++;
        const start = addMin(t, 35); const end = addMin(start, 90 + ((i * 11) % 60));
        if (end <= now) set(`infantRecords/${INFANT_ID}/events/evt_${pad(n)}`, {
          infantId: INFANT_ID, type: 'sleep', startedAt: localIso(start), endedAt: localIso(end),
          details: { durationMin: Math.round((end.getTime() - start.getTime()) / 60000) }, source: 'manual', createdBy: 'u_meera',
          provenance: { userStated: ['type', 'time'], modelInferred: [] }, createdAt: localIso(end), updatedAt: localIso(end),
        });
      }
      n++;
      const dt = addMin(t, 20);
      if (dt <= now) set(`infantRecords/${INFANT_ID}/events/evt_${pad(n)}`, {
        infantId: INFANT_ID, type: 'diaper', startedAt: localIso(dt), endedAt: null, details: { kind: i === 2 ? 'both' : i === 5 ? 'dirty' : 'wet' },
        source: 'manual', createdBy: 'u_arjun', provenance: { userStated: ['type', 'time'], modelInferred: [] }, createdAt: localIso(dt), updatedAt: localIso(dt),
      });
    });
  }

  [5, 3, 1].forEach((offset, k) => set(`maternalRecords/${MOTHER_ID}/checkins/chk_00${k + 1}`, {
    date: dateOnly(addDays(now, -offset)), mood: [3, 2, 3][k], energy: [2, 2, 3][k], rest: [2, 1, 3][k], pain: [5, 4, 3][k], support: [3, 4, 4][k],
    skipped: [], note: null, createdAt: localIso(addDays(now, -offset)),
  }));
  set(`maternalRecords/${MOTHER_ID}/journalEntries/jrn_001`, {
    createdAt: localIso(addMin(addDays(now, -2), -180)),
    transcript: 'Long night again. Anya fed twice after midnight and I barely slept. The stitches feel a bit better than last week. Arjun took the morning feed so I could rest a little.',
    reflection: { summary: 'You mentioned a long night with little sleep, that your stitches feel a bit better, and that Arjun took the morning feed so you could rest.', selfReportedTopics: ['sleep', 'physical_recovery', 'support'], followUpQuestion: 'Would you like to log how your stitches feel today?', medicalAssessment: false, requiresUserReview: true },
    reviewedByUser: true, audioRetained: false,
  });
  ([['incision_pain', 5, 'better', 6], ['incision_pain', 3, 'better', 2], ['breast_pain', 2, 'same', 1]] as const).forEach(([symptom, severity, trend, offset], k) =>
    set(`maternalRecords/${MOTHER_ID}/recoveryLogs/rec_00${k + 1}`, { symptom, severity, trend, note: null, onset: dateOnly(addDays(now, -offset - 1)), createdAt: localIso(addDays(now, -offset)) }));
  set(`maternalRecords/${MOTHER_ID}/medicationSchedules/med_iron`, { name: 'Iron and folic acid tablet', dose: '1 tablet (as prescribed)', times: ['09:00'], startDate: dateOnly(addDays(now, -40)), endDate: null, instructionsSource: 'clinician', note: 'Take after breakfast', createdAt: localIso(addDays(now, -40)) });
  set(`maternalRecords/${MOTHER_ID}/medicationSchedules/med_pain`, { name: 'Pain relief', dose: 'As prescribed by your doctor', times: ['08:00', '20:00'], startDate: dateOnly(addDays(now, -10)), endDate: dateOnly(addDays(now, 4)), instructionsSource: 'clinician', note: null, createdAt: localIso(addDays(now, -10)) });
  if (now.getHours() >= 9) set(`maternalRecords/${MOTHER_ID}/medicationEvents/mev_001`, { scheduleId: 'med_iron', scheduledFor: `${dateOnly(now)}T09:00`, status: 'taken', at: localIso(now) });

  for (const [subject, sid] of [['infant', INFANT_ID], ['mother', MOTHER_ID]] as const)
    for (const [purpose, granted] of [['audio_capture', true], ['transcription', true], ['ai_processing', true], ['storage', true], ['sharing', false], ['research', false]] as const)
      set(`consentRecords/${sid}_${purpose}`, { subjectType: subject, subjectId: sid, purpose, granted, grantedAt: granted ? localIso(addDays(now, -40)) : null, revokedAt: null, retentionPreference: purpose === 'audio_capture' ? 'ephemeral' : 'until_deleted' });
  // ---- Module records (mirrors backend seed) ----------------------------
  const inf = `infantRecords/${INFANT_ID}`;
  ([[0, 3.1, 49.0, 34.0], [14, 3.6, 51.5, 35.5], [35, 4.4, 54.5, 37.2]] as const).forEach(([d, w, l, h], k) =>
    set(`${inf}/growth/gro_00${k + 1}`, { date: dateOnly(addDays(birth, d)), weightKg: w, lengthCm: l, headCm: h, note: null, createdBy: 'u_meera', createdAt: localIso(now) }));
  ['bcg', 'opv0', 'hepb0'].forEach((v) => set(`${inf}/vaccinations/${v}`, { vaccineId: v, givenOn: dateOnly(birth), note: 'Given at the hospital', createdBy: 'u_meera', createdAt: localIso(now) }));
  set(`${inf}/milestones/mil_001`, { milestone: 'first_smile', date: dateOnly(addDays(now, -4)), note: "Smiled at Arjun's voice during the morning feed.", photo: null, createdBy: 'u_meera', createdAt: localIso(now) });
  set(`${inf}/visit_questions/vq_001`, { text: 'Is she feeding often enough in the evenings?', createdBy: 'u_meera', createdAt: localIso(now) });
  const mom = `maternalRecords/${MOTHER_ID}`;
  set(`${mom}/appointments/apt_001`, { title: 'Stitch review', date: dateOnly(addDays(birth, 10)), note: null, done: true, createdAt: localIso(now) });
  set(`${mom}/appointments/apt_002`, { title: '6-week postnatal check', date: dateOnly(addDays(birth, 45)), note: 'Bring the medicine list', done: false, createdAt: localIso(now) });
  set(`${mom}/appointments/apt_003`, { title: 'Blood pressure follow-up', date: dateOnly(addDays(birth, 56)), note: null, done: false, createdAt: localIso(now) });
  set(`${mom}/wins/win_001`, { text: 'Anya latched well at the 6 am feed.', date: dateOnly(addDays(now, -1)), createdAt: localIso(now) });
  set(`${mom}/hydration/${dateOnly(now)}`, { date: dateOnly(now), glasses: 3, createdAt: localIso(now) });
  set(`${mom}/settings/partner_prompts`, { enabled: false });

  const addDemoHousehold = (uid: string, displayName: string, householdId: string, babies: { id: string; name: string }[], days: number, motherId: string | null, role = 'mother') => {
    const birthDate = dateOnly(addDays(now, -days - (days >= 100 ? 10 : 0)));
    set(`users/${uid}`, { displayName, role, region: 'IN', householdId });
    set(`households/${householdId}`, { name: `${displayName}'s family`, memberUids: [uid], sharingPermissions: {}, createdAt: localIso(addDays(now, -days)) });
    for (const baby of babies) {
      const babyPath = `infantRecords/${baby.id}`;
      set(babyPath, { name: baby.name, birthDate, householdId, caregiverUids: [uid], timezone: 'Asia/Kolkata' });
      for (const [purpose, granted] of [['audio_capture', false], ['transcription', false], ['ai_processing', false], ['storage', false], ['sharing', false], ['research', false]] as const)
        set(`consentRecords/${baby.id}_${purpose}`, { subjectType: 'infant', subjectId: baby.id, purpose, granted, grantedAt: null, revokedAt: null, retentionPreference: purpose === 'audio_capture' ? 'ephemeral' : 'until_deleted' });
      let eventIndex = 0;
      for (let offset = days - 1; offset >= 0; offset--) {
        const day = addDays(now, -offset);
        const feedAt = new Date(day); feedAt.setHours(7, 15, 0, 0);
        const sleepAt = new Date(day); sleepAt.setHours(13, 0, 0, 0);
        const diaperAt = new Date(day); diaperAt.setHours(19, 30, 0, 0);
        const rows = [
          { type: 'feeding', at: feedAt, endedAt: null, details: { method: 'breast', side: offset % 2 ? 'left' : 'right' } },
          { type: 'sleep', at: sleepAt, endedAt: addMin(sleepAt, 75), details: { durationMin: 75, sleepEnvironment: { position: 'back', surface: 'crib_bassinet_play_yard', softItems: 'none', roomSharing: 'same_room_separate_surface' } } },
          { type: 'diaper', at: diaperAt, endedAt: null, details: { kind: 'wet' } },
        ];
        for (const row of rows) {
          if (row.at > now) continue;
          eventIndex++;
          set(`${babyPath}/events/demo_${String(eventIndex).padStart(5, '0')}`, {
            infantId: baby.id, type: row.type, startedAt: localIso(row.at), endedAt: row.endedAt ? localIso(row.endedAt) : null,
            details: row.details, source: 'manual', createdBy: uid, provenance: { userStated: ['type', 'time'], modelInferred: [] },
            createdAt: localIso(row.at), updatedAt: localIso(row.at),
          });
        }
      }
      const vaccinations = [['bcg', birthDate], ['opv0', birthDate], ['hepb0', birthDate]];
      if (days >= 60) vaccinations.push(['opv1', dateOnly(addDays(now, -days - 10 + 42))], ['penta1', dateOnly(addDays(now, -days - 10 + 42))]);
      for (const [vaccineId, givenOn] of vaccinations)
        set(`${babyPath}/vaccinations/${vaccineId}`, { vaccineId, givenOn, createdBy: uid, createdAt: localIso(now) });
      set(`${babyPath}/growth/demo_birth`, { date: dateOnly(addDays(now, -days)), weightKg: 3.2, lengthCm: 49, headCm: 34, createdBy: uid, createdAt: localIso(now) });
      set(`${babyPath}/growth/demo_recent`, { date: dateOnly(now), weightKg: 6.1, lengthCm: 61, headCm: 40, createdBy: uid, createdAt: localIso(now) });
    }
    if (motherId) {
      const motherPath = `maternalRecords/${motherId}`;
      set(motherPath, { name: displayName, ownerUid: uid, deliveryDate: birthDate, deliveryType: 'vaginal', region: 'IN', timezone: 'Asia/Kolkata' });
      for (const [purpose, granted] of [['audio_capture', false], ['transcription', false], ['ai_processing', false], ['storage', false], ['sharing', false], ['research', false]] as const)
        set(`consentRecords/${motherId}_${purpose}`, { subjectType: 'mother', subjectId: motherId, purpose, granted, grantedAt: null, revokedAt: null, retentionPreference: purpose === 'audio_capture' ? 'ephemeral' : 'until_deleted' });
      for (let offset = days - 1; offset >= 0; offset -= 14) {
        const entryDate = dateOnly(addDays(now, -offset));
        set(`${motherPath}/checkins/demo_${offset}`, { date: entryDate, mood: 3, energy: 3, rest: 2, pain: 2, support: 4, skipped: [], createdAt: localIso(addDays(now, -offset)) });
      }
      set(`${motherPath}/appointments/demo_followup`, { title: 'Postnatal follow-up', date: dateOnly(addDays(now, 7)), done: false, note: 'Reminder: confirm the appointment with your care team.', createdAt: localIso(now) });
      set(`${motherPath}/medicationSchedules/demo_clinician`, { name: 'Prescribed supplement', dose: 'As directed by your clinician', times: ['09:00'], startDate: dateOnly(addDays(now, -days)), endDate: null, instructionsSource: 'clinician', createdAt: localIso(now) });
      set(`${motherPath}/recoveryLogs/demo_recovery`, { symptom: 'tiredness', severity: 3, trend: 'same', onset: dateOnly(addDays(now, -2)), note: null, createdAt: localIso(addDays(now, -1)) });
      set(`households/${householdId}/nudges/demo_reminder`, { text: 'A reminder to check your upcoming postnatal follow-up.', forUids: [uid], createdAt: localIso(now), expiresAt: localIso(addDays(now, 7)), source: 'demo' });
    }
  };

  addDemoHousehold('u_demo30', 'Aarav', 'hh_demo30', [{ id: 'inf_demo30', name: 'Ira' }], 30, null, 'caregiver');
  addDemoHousehold('u_demo4m', 'Kavya', 'hh_demo4m', [{ id: 'inf_demo4m', name: 'Dev' }], 120, 'mom_demo4m');
  addDemoHousehold('u_demotwins', 'Nisha', 'hh_demotwins', [{ id: 'inf_twin_a', name: 'Tara' }, { id: 'inf_twin_b', name: 'Mira' }], 120, 'mom_demotwins');
  return docs;
}
