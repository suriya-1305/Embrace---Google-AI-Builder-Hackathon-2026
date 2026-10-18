# Modules

CrySense is modular. Every feature is a **module** with an id, a space (baby care or My space), a home **widget**, and optionally its own screen. Families switch modules on or off in **Edit home**, so each home screen shows only what they use. That keeps the app simple while still offering a lot.

## How a module is built

| Part | Where | Notes |
|---|---|---|
| Definition | `frontend/src/modules/defs.tsx` | `id`, `space`, `title`, `blurb`, `icon`, `hue`, tile `size` (`s`, `m`, `l`), `defaultOn`, `route`, `Widget` |
| Widget | `modules/babyWidgets.tsx`, `modules/momWidgets.tsx` | Loads its own data. Acts inline (one tap) or opens its screen |
| Screen | `features/baby/*`, `features/mother/*` | Optional |
| Data | `records/{kind}` endpoints | One generic, validated API for small modules |
| Library | `features/shared/Modules.tsx` | Switches per module, plus "Coming next" roadmap cards |

**Add a module in four steps:**

1. Add a schema to `backend/crysense/records.py` (`INFANT_KINDS` or `MOTHER_KINDS`).
2. Add its kind to `InfantRecordKind` or `MotherRecordKind` in `frontend/src/types.ts`, and the same check to the mock.
3. Write a widget (and optionally a screen and route).
4. Add one entry to `defs.tsx`.

Order in `defs.tsx` is the order on the home screen. Tiles use a dense two-column bento grid: `s` takes one column, `m` and `l` take two.

## Baby care modules

| Module | Widget does | Screen | Data | Default |
|---|---|---|---|---|
| Since last | Time since feed, sleep, diaper | Timeline | events | On |
| Cry check | Safety-first cry presence and recording-quality check; next checks from recent routine logs | Cry recorder, quality results, logged follow-up | audio analyses, events, soothe records | On |
| Quick log | Feed, Sleep, Diaper, Cry, "Say it instead" | Sheet, voice, cry check | events | On |
| Soothe | Play or stop shushing | Six on-device sounds, sleep timer, what helped | `records/soothe` | On |
| This week | Pattern question cards, one at a time | | `/observations` | On |
| Growth | Latest weight and trend line | Chart, add, delete | `records/growth` | On |
| Vaccines | Doses due now, or the next date | Schedule, mark given | `/vaccines`, `records/vaccinations` | On |
| Milestones | Latest moment and photo | Memory grid, add with photo | `records/milestones` | On |
| Recent | Last three logs | Timeline | events | On |
| Last 7 days | Days logged and feeds sparkline | Patterns | `/baseline` | On |
| Doctor visit | Number of saved questions | Printable one-pager | baseline, growth, vaccines, `records/visit_questions` | On |

## My space modules

| Module | Widget does | Screen | Data | Default |
|---|---|---|---|---|
| Check in | Today's status | Five skippable scales | checkins | On |
| Water | Count glasses with + and − | | `records/hydration` (one doc per day) | On |
| One good thing | Last win plus an inline input | | `records/wins` | On |
| Journal | Saved entries | Record, review, reflect | journalEntries | On |
| Medicines | Next dose | Today, list, add | medication* | On |
| Recovery | Last log and trend | Warning signs, log | recoveryLogs | On |
| Follow ups | Next appointment | List, done, add | `records/appointments` | On |
| Partner nudges | On/off switch | | `partner-prompts` setting | On (switch starts off) |
| Share | QR or send | Preview, 15-minute QR, send | care summaries, share links | On |
| Well-being | Five weekly questions | Questionnaire | screenings | On |
| Letter to my baby | Keepsake | Letter from milestones, chosen wins and her words; print | milestones, wins | On |

## Platform features

| Feature | Where |
|---|---|
| Red night light theme | Settings, or the theme button in the top bar (auto, day, night, red). Red light is the gentlest on sleepy eyes |
| One-handed mode | Settings. Adds a floating dock of four large quick-log buttons in thumb reach, and taller buttons |
| Voice language | Settings. Sent as `language` with every voice log and journal recording. Supports Indian languages; Gemini handles mixed speech such as Tamil-English |

## Privacy rules every module follows

- **Partner nudges** send one fixed, kind sentence ("Meera could use some rest today. Maybe take the next night feed...") only if she switched them on and logged low rest or energy. Never her scores, notes or journal. Expire after 24 hours. Audited.
- **QR share** shows only the fields she chose, closes after 15 minutes (server returns `410 Gone`), needs sharing consent and is audited. In live mode the QR holds a short random token. In browser demo mode there is no server, so the summary travels inside the link itself; that is for demos only.
- **Milestone photos** are resized on the phone (480 px JPEG) before saving.
- **Vaccine status** is date arithmetic on a reviewed India schedule file (`shared/content/vaccines_IN_v1.json`, verification pending).
- **Growth** shows the baby's own trend. WHO percentile curves need the official WHO tables before they can be drawn.
- **Soothing sounds** are generated on the device. No files, no network.
- **The letter** is a fixed template filled only with moments she saved. Nothing is invented.

## Coming next (roadmap cards in the library)

Twins and multiple babies, offline logging, watch and "Hey Google" logging, view-only access for grandparents, sleep environment, lactation support, nutrition guidance, weekly digest notifications, and community and expert answers.
