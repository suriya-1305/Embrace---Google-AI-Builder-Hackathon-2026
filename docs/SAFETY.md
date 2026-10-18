# Safety and clinical boundaries

CrySense supports caregivers. It does not diagnose, predict illness, or replace clinical care. These boundaries are enforced in code, not only stated in copy.

## What CrySense will never do

| Never | How the code prevents it |
|---|---|
| Say why a baby is crying (hunger, gas, pain, illness) | Cry analysis returns only `detected`, `not_detected` or `uncertain`. Tests assert no cause field exists |
| Reassure because a recording sounds fine | Warning signs run first. "You feel something is seriously wrong" is always urgent. The Help screen states a quiet baby is no reason to wait |
| Infer depression or a screening score from voice | No acoustic analysis of the mother's voice exists. Reflections are guarded against clinical terms |
| Detect self-harm with a model | Only the questionnaire's safety item and the recovery checklist (her own answers) trigger support, through deterministic rules |
| Contact anyone automatically | No code path sends alerts. Support results say "CrySense has not contacted anyone" |
| Change a medicine dose or time | Schedules come only from her entry, confirmed as the clinician's instructions. Dose events reject extra fields |
| Store raw audio | Audio is decoded in memory. Analyses keep metrics only |
| Share without consent | Sharing requires its own consent, a full preview, and is audited |

## Safety pathways

### Baby warning signs (`shared/rules/baby_warning_signs_v1.json`)

| Level | Examples | App behaviour |
|---|---|---|
| Emergency | Breathing trouble, blue or grey colour, floppy or hard to wake, seizure | Red panel, emergency numbers, recording paused |
| Urgent | Fever of 38 °C or more under 3 months, weak or high-pitched cry, green or bloody vomit, blood in stool, swollen tummy, injury, ingestion, parent feels something is wrong | Red panel, "get medical help today", recording paused |
| Seek advice | Feeding much less, fewer wet diapers, fever of 38 °C or more from 3 months | Amber panel, then the person may continue |

### Mother recovery flags (`shared/rules/mother_recovery_flags_v1.json`)

| Level | Examples | App behaviour |
|---|---|---|
| Emergency | Heavy bleeding, chest pain or sudden breathlessness | Emergency numbers |
| Support now | Thoughts of harming herself or her baby | Support lines and emergency numbers shown immediately. Nobody contacted |
| Urgent | Severe headache or vision change, one-sided leg pain or swelling, fever of 38 °C or more | Doctor today |
| Seek advice | Red, hot or leaking wound; red, hot breast with fever | Call doctor or midwife |

### Overwhelmed caregivers

The Help screen includes guidance for when crying becomes too much: put the baby down on their back in a safe, empty cot, step away, never shake a baby, call someone. This is the most important content in the app and is reachable from every screen, before sign-in and offline.

## Explicitly out of scope for this prototype

- Cry-cause classification. Available datasets (for example CryCeleb2023 for identity, Donate-a-Cry with contributor labels) do not establish causes, and licences need legal review.
- Pre-cry prediction.
- Proxy EPDS or any score inferred from free speech or acoustics.
- Medical-device positioning, clinician portal integration, FHIR interoperability.

## Release gates

| Gate | Owner | Status |
|---|---|---|
| Clinician review and localisation of every rules file and Help text | Clinical lead | Pending (`clinicalReview: pending` in each file) |
| Verified support numbers per region | Product | Pending (`verification: pending`) |
| Licensed, translated, approved questionnaire | Clinical + legal | Placeholder in use |
| Cry-presence model evaluated: precision, recall, false positives and negatives, abstention rate, by recording condition, split by infant and session | ML | Mock heuristic only |
| Speech-to-Text word error rate and critical-field error rate (amounts, times, medicine names) per language | ML | Not measured |
| Reflection factual consistency and unsupported-claim rate with human review | ML + clinical | Not measured |
| Firestore rules tests, cross-account, revoked-consent and deletion tests on deployed services | Engineering | Backend tests pass; rules tests to add |
| Data processing terms, region and retention for Gemini and Speech-to-Text with health data | Legal | Pending |

Do not collapse these into one "AI accuracy" number.
