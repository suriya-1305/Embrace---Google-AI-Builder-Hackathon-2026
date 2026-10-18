// Domain types shared by the mock API and the live API client.
// They mirror the backend responses documented in docs/API.md.

export type Iso = string;
export type Region = 'IN';
export type EventType = 'feeding' | 'sleep' | 'diaper';

export interface Provenance { userStated: string[]; modelInferred: string[] }

export interface BabyEvent {
  id: string;
  infantId: string;
  type: EventType;
  startedAt: Iso;
  endedAt?: Iso | null;
  details: Record<string, unknown>;
  note?: string | null;
  source: 'manual' | 'voice';
  provenance?: Provenance;
  createdBy?: string;
  createdAt?: Iso;
  updatedAt?: Iso;
  syncStatus?: 'pending';
}
export type EventInput = Pick<BabyEvent, 'type' | 'startedAt' | 'endedAt' | 'details' | 'note' | 'source' | 'provenance'> & { clientRequestId?: string };
export type EventPatch = Partial<Pick<BabyEvent, 'startedAt' | 'endedAt' | 'details' | 'note'>>;

export interface Me { uid: string; displayName: string; role: 'mother' | 'partner' | string; expertVerified?: boolean; region: Region; infantId: string | null; infantIds?: string[]; motherId: string | null }
export interface BabySetupInput { name: string; birthDate: string; caregiverName: string; caregiverRole: 'mother' | 'caregiver' }
export interface FamilyBabySetupInput { babies: { name: string; birthDate: string }[]; caregiverName: string; caregiverRole: 'mother' | 'caregiver' }
export interface MotherSetupInput { name: string; deliveryDate?: string; deliveryType?: string }
export interface Infant { id: string; name: string; birthDate: string; householdId: string; caregiverUids: string[]; timezone: string; ageDays: number }
export interface FamilyTimelineEvent extends BabyEvent { infantName: string }
export interface BabyViewLink { token: string; expiresAt: Iso; ttlMinutes: number }
export interface SharedBabyView { infantName: string; events: { type: EventType; startedAt: Iso; endedAt?: Iso | null; details: Record<string, unknown> }[]; expiresAt: Iso; readOnly: true }
export interface CommunityQuestion { id: string; title: string; text: string; status: 'pending' | 'approved' | 'rejected' | 'flagged'; answer: string | null; answerer?: string | null; reportCount: number; createdAt: Iso }
export interface CommunityGroup { id: string; name: string; description: string; icon: string; joined: boolean; memberCount: number }
export interface GroupContent { id: string; text: string; authorName: string; authorRole: 'peer' | 'moderator' | 'expert'; createdAt: string; status: 'published' | 'hidden'; own: boolean; example?: boolean }
export interface GroupPost extends GroupContent { groupId: string; title: string; kind: 'question' | 'experience' | 'challenge'; replyCount: number }
export interface GroupPostPage { posts: GroupPost[]; hasMore: boolean; page: number }
export interface Mother { id: string; name: string; ownerUid: string; deliveryDate: string; deliveryType?: string; region: Region; timezone: string; daysSinceBirth: number }

export interface BaselineDay { date: string; feeds: number; sleepMin: number; wet: number; dirty: number; events: number; hasData: boolean }
export interface Baseline {
  windowStart: string; windowEnd: string; days: BaselineDay[];
  coverage: { daysWithData: number; totalDays: number; percent: number };
  metrics: { feedsPerDay: number | null; sleepHoursPerDay: number | null; wetDiapersPerDay: number | null; dirtyDiapersPerDay: number | null; typicalFeedGapMin: number | null; averagedOverDays: number };
  note: string;
}

export interface AudioIssue { code: string; blocking: boolean; message: string }
export interface AudioQuality { ok: boolean; durationSec: number; sampleRate: number; rmsDb: number; peak: number; clippingRatio: number; silenceRatio: number; activeRatio: number; noiseFloorDb: number; issues: AudioIssue[] }
export interface NextSteps { checks: { id: string; minutesSince: number | null; priority: number; text: string }[]; guidance: string; isDiagnosis: false }
export type Presence = 'detected' | 'not_detected' | 'uncertain';
export interface SoundContextReview {
  status: 'ready' | 'simulated' | 'not_run' | 'unavailable';
  provider: 'gemini' | 'mock' | 'none';
  contextLogCount: number; contextWindowHours: number;
  sound: 'crying' | 'babbling' | 'other_sound' | 'uncertain';
  pitch: 'high' | 'mid' | 'low' | 'varied' | 'uncertain';
  pattern: 'intermittent' | 'continuous' | 'none' | 'uncertain';
  suggestions: { category: 'feeding' | 'diaper' | 'burping' | 'rest' | 'comfort'; reason: string }[];
  audibleFeatures?: string[];
  listeningSegments?: { startSec: number; endSec: number; sound: 'crying' | 'babbling' | 'other_sound' | 'uncertain'; pitch: string; pattern: string; tone: string }[];
  explanation?: string;
  cannotRuleOut?: string;
  disclaimer: string;
}
export interface CryAnalysis { id: string; createdAt: Iso; quality: AudioQuality; presence: Presence; confidence: number | null; modelVersion: string; limitations: string[]; rawAudioRetained: false; nextSteps: NextSteps; retry: boolean; contextReview?: SoundContextReview }

export interface SupportContact { label: string; number: string; detail: string }
export interface SupportContent { region: Region; name: string; emergency: SupportContact[]; support: SupportContact[]; overwhelmedGuidance: string[]; version: string; verification: string }

export type SafetyLevel = 'emergency' | 'support_now' | 'urgent' | 'seek_advice' | 'none';
export interface SafetyResult {
  level: SafetyLevel; messages: { ruleId: string; level: SafetyLevel; text: string }[];
  stopRoutineAnalysis: boolean; rulesetId: string; rulesetVersion: string; clinicalReview: string; support?: SupportContent;
}
export type BabyWarningAnswers = Partial<Record<
  'breathingDifficulty' | 'blueOrGreyColour' | 'floppyOrHardToWake' | 'seizure' | 'weakOrHighPitchedCry' | 'greenOrBloodyVomit' |
  'bloodInStool' | 'swollenAbdomen' | 'recentFallOrInjury' | 'possibleIngestion' | 'poorFeeding' | 'fewerWetDiapers' | 'parentThinksSeriouslyWrong', boolean>> & { tempC?: number | null };
export type MotherWarningAnswers = Partial<Record<
  'heavyBleeding' | 'chestPainOrBreathless' | 'severeHeadacheOrVision' | 'calfPainSwelling' | 'woundRedOrDischarge' | 'breastRedHotWithFever' | 'thoughtsOfHarm', boolean>> & { tempC?: number | null };

export interface VoiceDraft {
  transcript: string; speechProvider: string; model: string;
  status: 'ready' | 'needs_confirmation' | 'not_understood';
  draft: EventInput | null; missingFields: string[]; validationErrors: string[]; message?: string;
}

export interface CheckIn { id: string; date: string; mood?: number | null; energy?: number | null; rest?: number | null; pain?: number | null; support?: number | null; skipped: string[]; note?: string | null; createdAt: Iso }
export type CheckInInput = Omit<CheckIn, 'id' | 'date' | 'createdAt'>;
export interface Reflection { summary: string; selfReportedTopics: string[]; followUpQuestion: string | null; medicalAssessment: false; requiresUserReview: true }
export interface SupportChatMessage { role: 'user' | 'assistant'; text: string }
export interface SupportChatInput { message: string; history: SupportChatMessage[]; journalContext?: string }
export interface SupportChatReply { reply: string; provider: string; supportNow: boolean; support?: SupportContent; disclaimer: string }
export interface JournalEntry { id: string; createdAt: Iso; transcript: string; reflection: Reflection | null; reviewedByUser: true; audioRetained: false }

export type Symptom = 'bleeding' | 'incision_pain' | 'perineal_pain' | 'breast_pain' | 'headache' | 'swelling' | 'fever' | 'tiredness' | 'other';
export interface RecoveryLog { id: string; symptom: Symptom; severity: number; trend: 'better' | 'same' | 'worse'; onset: string; note?: string | null; createdAt: Iso }
export type RecoveryInput = Omit<RecoveryLog, 'id' | 'createdAt'>;

export interface MedicationSchedule { id: string; name: string; dose: string; times: string[]; startDate: string; endDate?: string | null; instructionsSource: 'clinician'; note?: string | null; active?: boolean }
export type MedicationInput = Omit<MedicationSchedule, 'id' | 'active'>;
export interface Dose { scheduleId: string; name: string; dose: string; scheduledFor: string; status: 'due' | 'taken' | 'skipped' | 'rescheduled'; rescheduledTo?: string | null }

export interface InstrumentItem { id: string; text: string; options: { label: string; score: number }[]; safetyItem?: boolean }
export interface Instrument { instrumentId: string; version: string; status: string; title: string; notice: string; recallPeriod: string; items: InstrumentItem[]; bandNote?: string }
export interface ScreeningResult {
  id?: string; instrumentId: string; instrumentVersion: string; instrumentStatus: string; safetyTriggered: boolean; skippedItems: string[];
  total: number | null; band: { id: string; label: string } | null; followUp: string | null; bandNote?: string; supportNow?: boolean; support?: SupportContent;
}

export type SummaryField = 'checkins' | 'recovery' | 'medications' | 'journal_reflections' | 'screening';
export interface CareSummaryRequest { recipientName: string; recipientRole: 'doctor' | 'midwife' | 'partner' | 'family' | 'other'; fields: SummaryField[]; periodDays: number }
export interface CareSummaryPreview { recipientName: string; recipientRole: string; periodDays: number; sections: { field: SummaryField; title: string; lines: string[] }[]; generatedAt: Iso; disclaimer: string; status?: string; sharedAt?: Iso; id?: string }

export type ConsentPurpose = 'audio_capture' | 'transcription' | 'ai_processing' | 'storage' | 'sharing' | 'research';
export interface Consent { purpose: ConsentPurpose; granted: boolean; grantedAt?: Iso | null; revokedAt?: Iso | null; retentionPreference?: string }
export type ConsentMap = Record<ConsentPurpose, Consent>;

export interface MotherHome { checkedInToday: boolean; lastCheckIn: CheckIn | null; nextDose: Dose | null; dosesToday: number; journalCount: number; lastRecovery: RecoveryLog | null }

export class ApiError extends Error {
  status: number; code?: string; purposes?: ConsentPurpose[];
  constructor(status: number, message: string, code?: string, purposes?: ConsentPurpose[]) {
    super(message.replace(/gemini/gi, 'Emi')); this.status = status; this.code = code; this.purposes = purposes;
  }
}

// ---- Modules ------------------------------------------------------------------
export type InfantRecordKind = 'growth' | 'vaccinations' | 'milestones' | 'soothe' | 'visit_questions' | 'visit_reports';
export type MotherRecordKind = 'appointments' | 'wins' | 'hydration';
export interface Growth { id: string; date: string; weightKg?: number | null; lengthCm?: number | null; headCm?: number | null; note?: string | null }
export type MilestoneKey = 'first_smile' | 'laughs' | 'holds_head' | 'rolls_over' | 'sits' | 'first_tooth' | 'crawls' | 'first_word' | 'stands' | 'first_steps' | 'other';
export interface Milestone { id: string; milestone: MilestoneKey; date: string; note?: string | null; photo?: string | null }
export interface Soothe { id: string; technique: string; helped: boolean; at: string }
export interface VisitQuestion { id: string; text: string }
export interface VisitReport { id: string; clientRequestId: string; date: string; note: string; clinician: string; nextVisitOn: string | null }
export interface CareDocumentDraft { measurementDate: string | null; weightKg: number | null; lengthCm: number | null; headCm: number | null; vaccinations: { vaccineId: string; givenOn: string }[]; warnings: string[]; provider: string; requiresReview: boolean; imageRetained: boolean }
export interface Appointment { id: string; title: string; date: string; note?: string | null; done: boolean }
export interface Win { id: string; text: string; date: string }
export interface Hydration { id: string; date: string; glasses: number }
export interface VaccineDose { id: string; name: string; atWeeks: number; dueDate: string; status: 'given' | 'due_now' | 'upcoming'; givenOn: string | null }
export interface VaccineSchedule { region: string; version?: string; verification?: string; note?: string; doses: VaccineDose[]; message?: string }
export interface Observation { id: string; text: string; question: string }
export interface Nudge { id: string; text: string; createdAt: string; expiresAt: string }
export interface ShareLink { token: string; expiresAt: string; ttlMinutes: number; payload?: string }
