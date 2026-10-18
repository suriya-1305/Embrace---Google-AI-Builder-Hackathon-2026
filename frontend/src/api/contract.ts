// The single interface every screen uses. Two implementations:
//   mock/mockApi.ts  -> in-browser, synthetic data, no network (VITE_API_MODE=mock)
//   live.ts          -> HTTP calls to the Baby API and Mother API (VITE_API_MODE=live)
import type {
  Appointment, BabyViewLink, FamilyBabySetupInput, FamilyTimelineEvent, Growth, Hydration, InfantRecordKind, Milestone, MotherRecordKind, Nudge, Observation, ShareLink, SharedBabyView, Soothe, VaccineSchedule, VisitQuestion, Win,
  BabyEvent, BabyWarningAnswers, Baseline, CareSummaryPreview, CareSummaryRequest, CheckIn, CheckInInput, CommunityQuestion, ConsentMap, ConsentPurpose,
  CryAnalysis, Dose, EventInput, EventPatch, Infant, Instrument, JournalEntry, Me, MedicationInput, MedicationSchedule, Mother, MotherHome,
  MotherWarningAnswers, NextSteps, RecoveryInput, RecoveryLog, Reflection, Region, SafetyResult, ScreeningResult, SupportContent, VoiceDraft,
} from '../types';
import type { SupportChatInput, SupportChatReply } from '../types';
import type { CareDocumentDraft, VisitReport } from '../types';
import type { CommunityGroup, GroupContent, GroupPost, GroupPostPage } from '../types';

export interface CommunityGroupsApi {
  list(): Promise<CommunityGroup[]>;
  join(groupId: string, displayName: string): Promise<void>;
  leave(groupId: string): Promise<void>;
  posts(groupId: string, page?: number, moderation?: boolean): Promise<GroupPostPage>;
  post(groupId: string, input: { kind: GroupPost['kind']; title: string; text: string }): Promise<GroupPost>;
  replies(groupId: string, postId: string, moderation?: boolean): Promise<GroupContent[]>;
  reply(groupId: string, postId: string, text: string): Promise<GroupContent>;
  deletePost(groupId: string, postId: string): Promise<void>;
  deleteReply(groupId: string, postId: string, replyId: string): Promise<void>;
  report(groupId: string, postId: string, replyId?: string): Promise<void>;
  block(groupId: string, postId: string, replyId?: string): Promise<void>;
  review(groupId: string, postId: string, status: 'published' | 'hidden', replyId?: string): Promise<void>;
}

export interface BabyApi {
  createProfile(input: import('../types').BabySetupInput): Promise<Me>;
  createProfiles(input: FamilyBabySetupInput): Promise<Me>;
  listInfants(): Promise<Infant[]>;
  familyEvents(days?: number): Promise<FamilyTimelineEvent[]>;
  createViewLink(ttlMinutes?: number): Promise<BabyViewLink>;
  getInfant(): Promise<Infant>;
  listEvents(days?: number): Promise<BabyEvent[]>;
  createEvent(input: EventInput): Promise<BabyEvent>;
  syncOfflineEvents(): Promise<number>;
  updateEvent(id: string, patch: EventPatch): Promise<BabyEvent>;
  deleteEvent(id: string): Promise<void>;
  voiceLog(input: { audio?: Blob; transcript?: string; language?: string }): Promise<VoiceDraft>;
  warningCheck(answers: BabyWarningAnswers, region: Region): Promise<SafetyResult>;
  cryAnalysis(audio: Blob): Promise<CryAnalysis>;
  reviewDocument(image: Blob, purpose: 'vaccination' | 'visit'): Promise<CareDocumentDraft>;
  nextSteps(): Promise<NextSteps>;
  baseline(days?: number): Promise<Baseline>;
  consents(): Promise<ConsentMap>;
  setConsent(purpose: ConsentPurpose, granted: boolean): Promise<void>;
  exportData(): Promise<unknown>;
  deleteData(): Promise<{ message: string }>;
  // Modules
  records<T = InfantRecordMap[InfantRecordKind]>(kind: InfantRecordKind): Promise<T[]>;
  addRecord<T = InfantRecordMap[InfantRecordKind]>(kind: InfantRecordKind, data: Record<string, unknown>): Promise<T>;
  deleteRecord(kind: InfantRecordKind, id: string): Promise<void>;
  vaccines(region: Region): Promise<VaccineSchedule>;
  observations(): Promise<Observation[]>;
  nudges(): Promise<Nudge[]>;
}

export interface InfantRecordMap { growth: Growth; vaccinations: { id: string; vaccineId: string; givenOn: string }; milestones: Milestone; soothe: Soothe; visit_questions: VisitQuestion; visit_reports: VisitReport }
export interface MotherRecordMap { appointments: Appointment; wins: Win; hydration: Hydration }

export interface MotherApi {
  createProfile(input: import('../types').MotherSetupInput): Promise<Mother>;
  getMother(): Promise<Mother>;
  home(): Promise<MotherHome>;
  listCheckins(): Promise<CheckIn[]>;
  createCheckin(input: CheckInInput): Promise<{ checkin: CheckIn; prompt: string | null }>;
  transcribeJournal(input: { audio?: Blob; transcript?: string; language?: string }): Promise<{ transcript: string; provider: string }>;
  reflect(transcript: string): Promise<{ reflection: Reflection; guardApplied: boolean; model: string }>;
  supportChat(input: SupportChatInput): Promise<SupportChatReply>;
  listJournal(): Promise<JournalEntry[]>;
  saveJournal(transcript: string, reflection: Reflection | null): Promise<JournalEntry>;
  deleteJournal(id: string): Promise<void>;
  listRecovery(): Promise<RecoveryLog[]>;
  createRecovery(input: RecoveryInput): Promise<RecoveryLog>;
  recoveryCheck(answers: MotherWarningAnswers): Promise<SafetyResult>;
  listMedications(): Promise<MedicationSchedule[]>;
  createMedication(input: MedicationInput): Promise<MedicationSchedule>;
  deleteMedication(id: string): Promise<void>;
  medicationsToday(): Promise<{ date: string; doses: Dose[]; note: string }>;
  logDose(scheduleId: string, scheduledFor: string, status: 'taken' | 'skipped' | 'rescheduled', rescheduledTo?: string): Promise<void>;
  instruments(): Promise<Instrument[]>;
  submitScreening(instrumentId: string, answers: Record<string, number | null>): Promise<ScreeningResult>;
  previewSummary(req: CareSummaryRequest): Promise<CareSummaryPreview>;
  shareSummary(req: CareSummaryRequest): Promise<CareSummaryPreview>;
  consents(): Promise<ConsentMap>;
  setConsent(purpose: ConsentPurpose, granted: boolean): Promise<void>;
  exportData(): Promise<unknown>;
  deleteData(): Promise<{ message: string }>;
  // Modules
  records<K extends MotherRecordKind>(kind: K): Promise<MotherRecordMap[K][]>;
  addRecord<K extends MotherRecordKind>(kind: K, data: Record<string, unknown>): Promise<MotherRecordMap[K]>;
  updateRecord<K extends MotherRecordKind>(kind: K, id: string, data: Record<string, unknown>): Promise<MotherRecordMap[K]>;
  deleteRecord(kind: MotherRecordKind, id: string): Promise<void>;
  partnerPrompts(): Promise<{ enabled: boolean }>;
  setPartnerPrompts(enabled: boolean): Promise<{ enabled: boolean }>;
  createShareLink(req: CareSummaryRequest, ttlMinutes: number): Promise<ShareLink>;
}

export interface CrySenseApi {
  me(): Promise<Me>;
  support(region: Region): Promise<SupportContent>;
  baby: BabyApi;
  mother: MotherApi;
  community: {
    groups: CommunityGroupsApi;
    listQuestions(moderation?: boolean): Promise<CommunityQuestion[]>;
    submitQuestion(title: string, text: string): Promise<CommunityQuestion>;
    reviewQuestion(id: string, status: 'approved' | 'rejected', answer: string): Promise<CommunityQuestion>;
    reportQuestion(id: string): Promise<{ reported: boolean }>;
  };
  reset(): Promise<void>;
  viewShared(token: string, payload?: string): Promise<{ summary: CareSummaryPreview; expiresAt: string }>;
  viewSharedBaby(token: string): Promise<SharedBabyView>;
}

export interface ApiContext { token: string; uid: string; infantId: string | null; motherId: string | null }
