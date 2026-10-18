# API reference

Two services. All requests except `/health`, `/v1/support` and `/v1/dev/reset` need `Authorization: Bearer <token>`:

- `AUTH_MODE=mock`: `mock-<uid>` (demo users `u_meera`, `u_arjun`)
- `AUTH_MODE=firebase`: a Firebase ID token

Request bodies reject unknown fields (`422`). Errors look like `{"detail": "..."}` or, for structured errors, `{"detail": {"code": "...", "message": "...", ...}}`.

| Status | Meaning |
|---|---|
| 401 | Not signed in, or token invalid or expired |
| 403 | Not the owner of a maternal record, or `consent_required` |
| 404 | Record not found or not yours (infant records) |
| 413 | Audio too large |
| 422 | Validation failed (`invalid_event`, bad times, unknown items) |

Live OpenAPI docs: `/docs` on each service.

## Common (both services)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Service name and active providers |
| GET | `/v1/support?region=IN` | Public. India emergency and support contacts, overwhelmed-caregiver guidance |
| POST | `/v1/dev/reset` | Memory store only: restore demo data |

## Baby API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/v1/me` | | `{uid, displayName, role, region, infantId, motherId}` |
| GET | `/v1/infants/{id}` | | Infant profile plus `ageDays` |
| GET | `/v1/infants/{id}/events?days=7` | | Events, oldest first (time, then id) |
| POST | `/v1/infants/{id}/events` | `EventIn` | Saved event (201) |
| PATCH | `/v1/infants/{id}/events/{eventId}` | `EventPatch` | Updated event; corrected fields move to `userStated` |
| DELETE | `/v1/infants/{id}/events/{eventId}` | | 204 |
| GET | `/v1/infants/{id}/baseline?days=7` | | Seven-day observed baseline |
| POST | `/v1/infants/{id}/voice-log` | multipart: `audio` (WAV) and/or `transcript` | Draft for confirmation (nothing saved) |
| POST | `/v1/infants/{id}/warning-check?region=IN` | `BabyWarningAnswers` | Safety result |
| POST | `/v1/infants/{id}/cry-analysis` | multipart: `audio` (16-bit WAV, ≤ 30 s) | Quality, presence, next steps |
| GET | `/v1/infants/{id}/next-steps` | | Non-diagnostic checks from the timeline |
| GET | `/v1/infants/{id}/consents` | | Map of six purposes |
| PUT | `/v1/infants/{id}/consents/{purpose}` | `{granted, retentionPreference?}` | Updated consent (audited) |
| GET | `/v1/infants/{id}/export` | | Profile, events, analyses, consents |
| DELETE | `/v1/infants/{id}/data` | | Counts deleted (profile kept) |

### Community groups

All `/v1/community/groups` routes require authentication. Listing groups is available before joining; reading or contributing to a group's conversations requires membership. Joining uses a group-specific display name, not private maternal or infant records. Responses expose aliases and verified server roles, not member UIDs.

| Method | Path (prefix `/v1/community/groups`) | Body / Behavior |
|---|---|---|
| GET | `/` | Group names, joined state and member counts |
| POST, DELETE | `/{group}/membership` | Join with `{displayName}` / leave; posts remain |
| GET, POST | `/{group}/posts` | Paginated feed (10 per page) / `{kind, title, text}`; kind is question, experience or challenge |
| GET, POST | `/{group}/posts/{post}/replies` | Replies / `{text}` |
| DELETE | `/{group}/posts/{post}` | Own post or moderator only |
| DELETE | `/{group}/posts/{post}/replies/{reply}` | Own reply or moderator only |
| POST | `/{group}/posts/{post}/report` | `{replyId?}`; distinct reporters, hidden at three reports |
| POST | `/{group}/posts/{post}/block` | `{replyId?}`; hides that author for the caller |
| PUT | `/{group}/posts/{post}/moderation` | Moderator-only `{status: published\|hidden, replyId?}` |

`GET /{group}/posts?moderation=true` is moderator-only and includes hidden posts and parent threads with hidden replies. Moderator assignments are server-managed; ordinary participants are labelled peers. The implementation does not imply that a staffed moderation service exists. Test-family groups use the same interface but persist locally with explicitly labelled example conversations, separate from live members.

### EventIn

```json
{
  "type": "feeding",
  "startedAt": "2026-10-16T20:00:00+05:30",
  "endedAt": null,
  "details": { "method": "formula", "amountMl": 90, "side": null },
  "note": null,
  "source": "voice",
  "provenance": { "userStated": ["eventType", "amountMl", "startTimeLocal"], "modelInferred": [] }
}
```

`details` by type: feeding `{method: breast|bottle|formula|expressed, amountMl?, side?}`, sleep `{durationMin}` (computed from start and end), diaper `{kind: wet|dirty|both|dry}`.

### Voice-log response

```json
{
  "transcript": "Fed 90 ml formula at 8 pm",
  "speechProvider": "google-stt-v2",
  "model": "gemini:gemini-3.5-flash",
  "status": "ready",
  "draft": { "...": "EventIn" },
  "missingFields": [],
  "validationErrors": []
}
```

`status` is `ready`, `needs_confirmation` (something was assumed, missing or invalid) or `not_understood` (`draft: null`, with a message).

### Baby sound-check response

### Public sample AI gateway

`POST /v1/demo/ai/{operation}` supports `sound`, `voice_log`, `journal_transcribe`, and `journal_reflect` with real server-side Gemini. Multipart fields: `context` (JSON containing an allowlisted `sampleInfantId` and at most eight `recentEvents`), `aiConsent`, `audioConsent`, optional WAV `audio`, optional `text` and `language`. It does not authenticate as a real user, read real family records, or persist input/output content. It is a bounded public demonstration, not a private-account API.

Consent is required; context is capped at 16,000 characters and text at 6,000. Sound/voice recordings are limited to 30 seconds and 2 MB; journal transcription supports the 90-second recorder with a 4 MB cap. Context details are sanitized. A shared Firestore transaction enforces six requests per UTC minute and sixty per UTC day across all operations. Quotas return `429` with `Retry-After`; unavailable Gemini returns `502`/`503` or an explicit unavailable sound review, with no fake fallback. Voice-log returns `transcript`, `provider`, and `extracted` for client confirmation. Journal endpoints mirror the transcript/reflection contracts. The client keeps sample records and reviewed outputs in its isolated local store.

### Authenticated sound review

### Post-journal support conversation

`POST /v1/mothers/{id}/support/chat` requires maternal ownership and `ai_processing` consent. JSON fields: `message` (1-1,000 characters), `history` (up to six user/assistant messages, each up to 1,000 characters), and optional `journalContext` (up to 3,000 characters). The journal is not looked up automatically. The response contains `reply`, `provider`, `supportNow`, `disclaimer`, and optional support contacts. Messages and replies are not persisted.

Demo mode uses `/v1/demo/ai/support_chat`, with the same JSON encoded in the multipart `text` field and the existing sample context/consent fields. It uses the shared demo AI budget. Explicit danger language returns fixed human-support guidance without a model call, including after quota exhaustion. Model prompts prohibit diagnoses, treatment and dependency-building language; reply guards provide a conservative fallback when clinical or unsafe wording appears. This is general AI conversation, not a crisis service or psychotherapy.

### Sound-review payload

### Care-document review

`POST /v1/infants/{id}/documents/review` accepts multipart `image` (JPEG/PNG/WebP, maximum 4 MB) and `purpose` (`vaccination` or `visit`). Infant access and AI-processing consent are required. Demo mode uses `/v1/demo/ai/care_document`, with the same image/purpose, an allowlisted sample context and the shared demo quota.

The response has optional `measurementDate`, `weightKg`, `lengthCm`, `headCm`, a `vaccinations` array (`vaccineId`, `givenOn`), warnings, and `requiresReview: true`, `imageRetained: false`. Dates are checked, vaccine IDs are restricted to the configured schedule, and numeric measurement bounds are enforced by application code. The image and extracted result are not persisted by review. The caregiver must review and save normal growth/vaccination records explicitly.

`records/visit_reports` stores `{clientRequestId, date, note, clinician, nextVisitOn}`. The UUID request ID is the record key so retries upsert the same report. Visit, measurement and administered-dose dates must be valid past/present dates; the next appointment must not precede the visit.

### Example sound payload

The backward-compatible `/cry-analysis` endpoint now requires `audio_capture` and `ai_processing` consent. With `AI_PROVIDER=gemini`, clear clips are reviewed alongside at most eight baby-only care events from the last 24 hours. Context includes age in days, event type/time and allowlisted structured details, never names, user IDs, notes or other babies' records. Sound observations are not classifications of hunger, gas, pain or illness. Silent, invalid, clipped and heavily noisy recordings are not sent to Gemini. The raw audio is never stored.

`contextReview` reports `ready`, `simulated`, `not_run` or `unavailable`, its provider, `contextLogCount`, `contextWindowHours`, enum-only `sound`, `pitch` and `pattern`, and up to three server-worded `suggestions` (`category`, `reason`). Categories are `feeding`, `diaper`, `burping`, `rest` and `comfort`, not diagnoses or probabilities. A model outage returns `unavailable`; it never silently substitutes a simulated Gemini review.

Emi also supplies up to four enum-only `audibleFeatures` and three chronological `listeningSegments` (`startSec`, `endSec`, `sound`, relative `pitch`, `pattern`, `tone`). Invalid, overlapping or out-of-clip segments are discarded. The server supplies `explanation` and `cannotRuleOut`; these are observable descriptions, not phonetic cry-language decoding. Neither hunger/gas/pain labels nor illness/pain exclusions are inferred from cadence or pitch, and no invented numerical fundamental frequency is reported.

```json
{
  "id": "cry_3f2a...",
  "quality": {
    "ok": true, "durationSec": 7.0, "sampleRate": 16000, "rmsDb": -18.6, "peak": 0.5,
    "clippingRatio": 0.0, "silenceRatio": 0.24, "activeRatio": 0.71, "noiseFloorDb": -120.0,
    "issues": []
  },
  "presence": "detected",
  "confidence": 0.9,
  "modelVersion": "mock-energy-0.1",
  "limitations": ["Only tells whether crying is present. It does not tell why a baby is crying.", "..."],
  "rawAudioRetained": false,
  "retry": false,
  "nextSteps": { "checks": [{ "id": "feeding_cues", "minutesSince": 165, "priority": 1, "text": "..." }], "guidance": "...", "isDiagnosis": false }
}
```

Issue codes: `too_short` (< 3 s), `too_long` (> 30 s), `silent`, `low_level`, `clipping` (all blocking), `background_noise` (non-blocking, forces `uncertain`), `unsupported_format`.

### Safety result (warning-check, recovery/check)

```json
{
  "level": "urgent",
  "messages": [{ "ruleId": "B-UR-1", "level": "urgent", "text": "A temperature of 38°C or more ..." }],
  "stopRoutineAnalysis": true,
  "rulesetId": "baby_warning_signs",
  "rulesetVersion": "1.0.0-draft",
  "clinicalReview": "pending",
  "support": { "region": "IN", "emergency": [...], "support": [...], "overwhelmedGuidance": [...] }
}
```

Levels, highest first. Baby: `emergency`, `urgent`, `seek_advice`, `none`. Mother: `emergency`, `support_now`, `urgent`, `seek_advice`, `none`.

## Mother API

All `/v1/mothers/{id}/*` routes return 403 unless the caller is the record's owner.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/v1/mothers/{id}` | | Profile plus `daysSinceBirth` |
| GET | `/v1/mothers/{id}/home` | | Today summary: check-in status, next dose, journal count, last recovery |
| GET, POST | `/v1/mothers/{id}/checkins` | `CheckInIn` | List / `{checkin, prompt}` |
| POST | `/v1/mothers/{id}/journal/transcribe` | multipart `audio` and/or `transcript` | `{transcript, provider, audioRetained: false, requiresUserReview: true}` |
| POST | `/v1/mothers/{id}/journal/reflect` | `{transcript}` | `{reflection, model, guardApplied}` |
| GET, POST | `/v1/mothers/{id}/journal` | `{transcript, reflection?, reviewedByUser: true}` | List (newest first) / saved entry |
| DELETE | `/v1/mothers/{id}/journal/{entryId}` | | 204 (audited) |
| GET, POST | `/v1/mothers/{id}/recovery` | `RecoveryIn` | List / saved log |
| POST | `/v1/mothers/{id}/recovery/check` | `MotherWarningAnswers` | Safety result |
| GET, POST | `/v1/mothers/{id}/medications` | `MedicationIn` (`instructionsSource: "clinician"` required) | List with `active` / saved schedule |
| DELETE | `/v1/mothers/{id}/medications/{scheduleId}` | | 204 |
| GET | `/v1/mothers/{id}/medications/today` | | `{date, doses[], note}` |
| POST | `/v1/mothers/{id}/medications/{scheduleId}/events` | `{scheduledFor, status, rescheduledTo?}` | Saved dose event. Any other field is rejected |
| GET | `/v1/screening/instruments` | | Instrument JSON |
| GET, POST | `/v1/mothers/{id}/screenings` | `{instrumentId, answers: {q1: 0..3 \| null}}` | List (answers omitted) / result |
| POST | `/v1/mothers/{id}/care-summaries/preview` | `CareSummaryIn` | Exact text that would be shared |
| GET, POST | `/v1/mothers/{id}/care-summaries` | `CareSummaryIn` | List / shared summary (needs `sharing` consent, audited) |
| GET, PUT | `/v1/mothers/{id}/consents[/{purpose}]` | `{granted}` | Consent map / updated consent |
| GET | `/v1/mothers/{id}/export` | | All her records |
| DELETE | `/v1/mothers/{id}/data` | | Counts deleted |

### Reflection

```json
{
  "summary": "You talked about how rest and sleep have been, how your body is recovering and the support around you.",
  "selfReportedTopics": ["sleep", "physical_recovery", "support"],
  "followUpQuestion": "Would it help to plan one rest window for tomorrow?",
  "medicalAssessment": false,
  "requiresUserReview": true
}
```

### Screening result

```json
{
  "instrumentId": "demo_wellbeing", "instrumentVersion": "0.1.0-placeholder", "instrumentStatus": "placeholder",
  "total": 5, "band": { "id": "middle", "label": "Demo band: middle" }, "followUp": "...",
  "skippedItems": [], "safetyTriggered": false, "bandNote": "Demo bands are not clinical cut-offs."
}
```

With a skipped item, `total` and `band` are `null`. When the safety item triggers, `supportNow: true` and `support` contacts are included.

### CareSummaryIn

```json
{ "recipientName": "Dr. Rao", "recipientRole": "doctor", "fields": ["checkins", "recovery", "medications"], "periodDays": 7 }
```

`fields`: `checkins`, `recovery`, `medications`, `journal_reflections` (summaries only, never full entries), `screening`.

## Consent purposes

`audio_capture`, `transcription`, `ai_processing`, `storage`, `sharing`, `research`.

| Action | Requires |
|---|---|
| Voice log with audio | audio_capture, transcription, ai_processing |
| Voice log typed | transcription, ai_processing |
| Baby sound check | audio_capture, ai_processing |
| Journal transcribe (audio) | audio_capture, transcription |
| Journal reflect | ai_processing |
| Journal save | storage |
| Share summary | sharing |

Missing consent returns `403 {"detail": {"code": "consent_required", "purposes": [...], "message": "..."}}`. The app shows a consent card and retries once the person allows it.

## Module endpoints

### Baby API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/v1/infants/{id}/records/{kind}` | | Records, sorted by date then id |
| POST | `/v1/infants/{id}/records/{kind}` | Kind schema | Saved record (201). `vaccinations` upsert by key |
| DELETE | `/v1/infants/{id}/records/{kind}/{recordId}` | | 204 |
| GET | `/v1/infants/{id}/vaccines?region=IN` | | Schedule with `dueDate` and `status` (`given`, `due_now`, `upcoming`) |
| GET | `/v1/infants/{id}/observations` | | Pattern question cards `{id, text, question}` |
| GET | `/v1/infants/{id}/nudges` | | Partner nudges addressed to the caller and not expired |

Infant kinds: `growth {date, weightKg?, lengthCm?, headCm?, note?}`, `vaccinations {vaccineId, givenOn, note?}`, `milestones {milestone, date, note?, photo?}`, `soothe {technique, helped, at}`, `visit_questions {text}`.

### Mother API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET, POST | `/v1/mothers/{id}/records/{kind}` | Kind schema | List / saved (201). `hydration` upserts by date |
| PUT, DELETE | `/v1/mothers/{id}/records/{kind}/{recordId}` | Kind schema | Updated / 204 |
| GET, PUT | `/v1/mothers/{id}/partner-prompts` | `{enabled}` | Setting (audited) |
| POST | `/v1/mothers/{id}/care-summaries/share-link?ttlMinutes=15` | `CareSummaryIn` | `{token, expiresAt, ttlMinutes}`. Needs `sharing` consent, audited |
| GET | `/v1/shared/{token}` | | Public. Summary until expiry, then `410`. Unknown token `404` |

Mother kinds: `appointments {title, date, note?, done}`, `wins {text, date}`, `hydration {date, glasses 0-20}`.

Invalid values return `422 {"detail": {"code": "invalid_record", "errors": [...]}}`. Unknown kinds return `404`. Voice endpoints (`voice-log`, `journal/transcribe`) accept an optional `language` form field (`en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `kn-IN`, `ml-IN`, `bn-IN`, `mr-IN`, `en-US`).
