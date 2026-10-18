# Data model

The same document paths are used by the in-memory store, the browser mock and Cloud Firestore. Every document stores its own `id`. Timestamps are ISO 8601 with a timezone offset. Lists are always sorted by time, then by id, so output is deterministic.

## Collections

```
users/{uid}
households/{householdId}
infantRecords/{infantId}
  events/{eventId}
  audioAnalyses/{analysisId}
  growth/{id}  vaccinations/{vaccineId}  milestones/{id}  soothe/{id}  visit_questions/{id}
households/{householdId}/nudges/{id}
maternalRecords/{motherId}
  checkins/{checkinId}
  journalEntries/{entryId}
  screenings/{screeningId}
  recoveryLogs/{logId}
  medicationSchedules/{scheduleId}
  medicationEvents/{eventId}
  careSummaries/{summaryId}
  appointments/{id}  wins/{id}  hydration/{YYYY-MM-DD}  settings/partner_prompts
shareLinks/{token}
consentRecords/{subjectId}_{purpose}
auditEvents/{auditId}
```

Infant and maternal data are separate trees with separate authorisation. For production, consider separate Firestore databases or projects and separate service accounts per tree.

## Identity and household

| Path | Fields |
|---|---|
| `users/{uid}` | `displayName`, `role` (`mother` / `partner`), `region` (`IN`), `householdId`, `createdAt` |
| `households/{id}` | `name`, `memberUids[]`, `sharingPermissions: {uid: {infant: bool, mother: bool}}` |

## Baby

| Path | Fields |
|---|---|
| `infantRecords/{id}` | `name`, `birthDate`, `householdId`, `caregiverUids[]`, `timezone` |
| `.../events/{id}` | `infantId`, `type` (`feeding` / `sleep` / `diaper`), `startedAt`, `endedAt`, `details`, `note`, `source` (`manual` / `voice`), `provenance {userStated[], modelInferred[]}`, `createdBy`, `createdAt`, `updatedAt`, `updatedBy?` |
| `.../audioAnalyses/{id}` | `quality {...metrics, issues[]}`, `presence`, `confidence`, `modelVersion`, `limitations[]`, `rawAudioRetained: false`, `createdBy`, `createdAt` |

`provenance` separates what the person said from what a model or the code assumed. Correcting a field moves it from `modelInferred` to `userStated`.

## Mother

| Path | Fields |
|---|---|
| `maternalRecords/{id}` | `name`, `ownerUid`, `deliveryDate`, `deliveryType`, `region`, `timezone` |
| `.../checkins/{id}` | `date`, `mood` 1-5, `energy` 1-5, `rest` 1-5, `pain` 0-10, `support` 1-5 (each nullable), `skipped[]`, `note`, `createdAt` |
| `.../journalEntries/{id}` | `transcript` (as reviewed), `reflection` or null, `reviewedByUser: true`, `audioRetained: false`, `createdAt` |
| `.../screenings/{id}` | `instrumentId`, `instrumentVersion`, `instrumentStatus`, `answers`, `total`, `band`, `skippedItems[]`, `safetyTriggered`, `followUp`, `createdAt` |
| `.../recoveryLogs/{id}` | `symptom`, `severity` 0-10, `trend` (`better` / `same` / `worse`), `onset`, `note`, `createdAt` |
| `.../medicationSchedules/{id}` | `name`, `dose` (text as written), `times[]` HH:MM, `startDate`, `endDate`, `instructionsSource: "clinician"`, `note`, `createdAt` |
| `.../medicationEvents/{id}` | `scheduleId`, `scheduledFor` (YYYY-MM-DDTHH:MM), `status` (`taken` / `skipped` / `rescheduled`), `rescheduledTo`, `at` |
| `.../careSummaries/{id}` | `recipientName`, `recipientRole`, `periodDays`, `sections[]`, `disclaimer`, `status: "shared_demo"`, `sharedAt`, `delivery` |

## Consent and audit

| Path | Fields |
|---|---|
| `consentRecords/{subjectId}_{purpose}` | `subjectType` (`infant` / `mother`), `subjectId`, `purpose`, `granted`, `grantedAt`, `revokedAt`, `retentionPreference` (`ephemeral` / `30d` / `until_deleted`), `updatedBy` |
| `auditEvents/{id}` | `actor`, `action` (`consent.updated`, `infant.exported`, `infant.data_deleted`, `journal.deleted`, `care_summary.shared`, ...), `subjectId`, `meta` (no content), `at` |

## Synthetic seed

`backend/crysense/store/seed.py` and `frontend/src/api/mock/seed.ts` build the same fictional household relative to "now":

- Meera (`u_meera`, mother, owner of `mom_meera`) and Arjun (`u_arjun`, partner).
- Anya (`inf_anya`), 6 weeks old.
- Six of the last seven days logged (8 feeds a day, sleeps, diapers). Day three is empty on purpose to show missing-data handling.
- Three check-ins, one journal entry, three recovery logs, two medicine schedules, and consents (sharing and research off).

## Retention

| Data | Default |
|---|---|
| Raw audio | Never stored. Decoded in memory and discarded |
| Audio analyses | Metrics only, until deleted |
| Journal transcripts | Only after she reviews and saves. Deletable per entry |
| Everything else | Until deleted through Settings or the `DELETE /data` endpoints |

## Module records

| Path | Fields |
|---|---|
| `.../growth/{id}` | `date`, `weightKg` (0.5-30), `lengthCm` (30-120), `headCm` (20-60), `note` |
| `.../vaccinations/{vaccineId}` | `vaccineId`, `givenOn`, `note` (one doc per dose) |
| `.../milestones/{id}` | `milestone`, `date`, `note`, `photo` (resized JPEG data URL) |
| `.../soothe/{id}` | `technique`, `helped`, `at` |
| `.../visit_questions/{id}` | `text` |
| `households/{id}/nudges/{id}` | `text` (fixed sentence), `forUids[]`, `createdAt`, `expiresAt` (+24 h), `source` |
| `maternalRecords/.../appointments/{id}` | `title`, `date`, `note`, `done` |
| `.../wins/{id}` | `text`, `date` |
| `.../hydration/{date}` | `date`, `glasses` (0-20) |
| `.../settings/partner_prompts` | `enabled`, `updatedAt` |
| `shareLinks/{token}` | `motherId`, `summary`, `createdAt`, `expiresAt` |

Every module record also stores `createdAt` and, for infant records, `createdBy`.
