# CrySense performance study

## Status and headline

A local synthetic-data baseline was measured on 2026-10-18. It exercised the
application over loopback HTTP, with memory storage, mock authentication, and
mock AI/speech/audio providers. It is **not** the separate cloud/provider
benchmark: Gemini, Speech-to-Text, Firebase Authentication, Firestore, Cloud
Run, and production-region latency were not measured.

This study sets no pilot latency or error-rate target and does not score results
against an SLO. Agree and record thresholds before running the separate
acceptance/load test. No proposed target below is presented as a measurement.

| Evaluation area | Local evidence | What it establishes |
|---|---|---|
| Core API latency and errors | Authenticated profile, event-list, baseline, and maternal-home requests; 50 requests at each of 1, 8, and 24 concurrent request slots | Local mock-stack latency and HTTP outcomes only |
| AI response latency and availability | Consent-enabled voice draft, journal reflection, and synthetic sound-review routes | Mock provider/API overhead; not external-provider latency or availability |
| Draft fields | 12 hand-labeled synthetic utterances; field-level micro and per-field precision/recall | Rule-coverage conformance on this tiny, non-blinded fixture only |
| Sound-note validity | Synthetic WAV plus injected valid/invalid provider outputs | Audio-quality path, enum rejection, and clip-bound/overlap filtering |
| Load behavior and cost | 1,200 measured HTTP requests across three concurrency levels; mock-only execution | Single-process local behavior; cloud cost and production capacity remain unknown |
| Privacy/access | 10 of 10 in-process checks passed against seeded memory data | Demonstrated local gates and retention behavior, not deployed IAM/Firestore behavior |

**No clinical accuracy, diagnosis, or user correction rate was evaluated.**

## Build and test environment

| Item | Recorded value |
|---|---|
| Application/version | CrySense prototype 0.1.0 (front-end title: Embrace) |
| Revision | Unavailable; the workspace has no Git revision |
| Test date/time | 2026-10-18; exact UTC timestamp is in `performance-study-results.json` |
| Host | Windows 11, Python 3.14.4, 16 logical processors |
| Service | `dev_combined:app`, one Uvicorn worker, loopback HTTP |
| Region | Local host; cloud region not applicable |
| Storage/auth | Memory store; mock auth tokens |
| AI/speech/audio | `mock-rules-0.1`, mock speech, `mock-energy-0.1` |
| Test data | Application's fictional seeded records; 12 synthetic labeled text utterances; a deterministic six-second, mono 16 kHz generated tone/WAV |
| Consent | The benchmark explicitly granted the relevant infant and maternal test consents before repeated AI-route requests |
| Backend/provider API calls | None; provider credentials were removed from the benchmark subprocess environment |

Run the study from the workspace root:

```powershell
python scripts\performance_study.py --requests 50 --concurrency 1,8,24 --output docs\performance-study-results.json
```

Each of the eight HTTP scenarios ran 50 requests at each concurrency level
(1,200 requests total). The reported percentile is the nearest-rank percentile
of per-request wall-clock latency measured by the local HTTP client. Throughput
is requests divided by the scenario wall time. The concurrency figures are
simultaneous request slots, **not distinct users or accounts**; authenticated
requests used the same seeded demo identities. The JSON contains status counts,
timeouts/transport errors, response sizes, throughput, and the full study
metadata.

## API latency and load results

Values are `p50 / p95` in milliseconds. All scenarios had 50 requests per
concurrency level and returned HTTP 200 for every request.

| Scenario | 1 concurrent | 8 concurrent | 24 concurrent | Throughput req/s (1 / 8 / 24) |
|---|---:|---:|---:|---:|
| Public health | 3.19 / 3.95 | 11.74 / 42.15 | 30.00 / 75.40 | 313.49 / 488.63 / 583.20 |
| Authenticated infant profile | 4.61 / 5.98 | 13.86 / 29.87 | 51.42 / 112.70 | 214.84 / 486.26 / 331.82 |
| Authenticated event list | 6.13 / 8.11 | 31.29 / 41.19 | 84.86 / 137.44 | 162.49 / 239.78 / 247.60 |
| Authenticated baseline | 5.63 / 8.09 | 30.51 / 55.47 | 80.09 / 115.72 | 166.21 / 229.00 / 262.04 |
| Authenticated maternal home | 4.75 / 6.41 | 14.59 / 26.89 | 56.54 / 134.28 | 202.48 / 429.41 / 309.22 |
| Consented voice draft (mock AI) | 4.49 / 5.59 | 14.99 / 38.22 | 33.18 / 66.03 | 212.95 / 380.88 / 509.37 |
| Consented journal reflection (mock AI) | 4.86 / 7.27 | 17.29 / 35.50 | 44.67 / 99.02 | 199.35 / 342.83 / 420.71 |
| Consented sound review (mock) | 12.34 / 16.99 | 39.22 / 99.79 | 114.28 / 179.54 | 78.85 / 165.51 / 185.76 |

Across the measured workload, **1,200/1,200** requests were 2xx; 4xx, 5xx,
transport exceptions, and timeouts were all zero. Those counts exclude the
separate access-control probes below, whose 401/403/404 outcomes are expected.
Latency rises at higher concurrency, especially for event listing, baseline,
and sound analysis. This is descriptive for one local process and small seeded
dataset—not a capacity limit or production forecast.

### AI/provider availability and cost

All three AI-like routes returned 50/50 successful responses at each level, but
the provider was mocked. The observed local p50/p95 values are in the table;
they do not measure model inference, provider queueing, network timeouts,
provider errors, or real service availability. No billable provider/model API requests were made. Cloud cost, cost per task,
and production infrastructure cost were not measured. The one browser preview
did load the external font stylesheet noted below.

## Synthetic draft-field evaluation

The 12-item fixture covers feeding, sleep, diaper, partial/missing fields, and
one unrelated utterance. Field facts are compared exactly; time provenance is
scored separately from the actual clock value when the application marks a
time as inferred. Results:

| Field | TP | FP | FN | Precision | Recall |
|---|---:|---:|---:|---:|---:|
| Event type | 11 | 0 | 0 | 1.000 | 1.000 |
| Amount (ml) | 3 | 0 | 0 | 1.000 | 1.000 |
| Feeding method | 2 | 0 | 0 | 1.000 | 1.000 |
| Side | 2 | 0 | 0 | 1.000 | 1.000 |
| Diaper kind | 3 | 0 | 0 | 1.000 | 1.000 |
| Explicit local time | 10 | 0 | 0 | 1.000 | 1.000 |
| Time provenance | 11 | 0 | 0 | 1.000 | 1.000 |
| Sleep duration | 2 | 0 | 0 | 1.000 | 1.000 |
| **Micro total** | **44** | **0** | **0** | **1.000** | **1.000** |

Output status counts were 5 `ready`, 6 `needs_confirmation`, and 1
`not_understood`; 7/12 (58.3%) therefore required confirmation or had no draft.
This is only a confirmation-required proxy. **Actual correction rate was not
measured.**

These perfect fixture scores must not be generalized: the set is small,
hand-labeled, non-blinded, and deliberately aligned to the deterministic mock
parser's rule coverage. It is not an independent accuracy evaluation and does
not establish production AI accuracy or clinical validity. The separate study
should use a larger independently labeled set, blinded reviewers, correction
events, and per-field agreement/error analysis.

## Sound-note validity

The route accepted the generated six-second WAV as quality-valid, returned the
mock label `crying`, and reported `rawAudioRetained: false`. That label is the
mock energy heuristic applied to generated audio; it is **not** a verified
cry/no-cry label. The mock route itself emits no timed listening segments.

Additional synthetic provider-injection checks verified:

- an accepted segment remained within the six-second clip;
- overlapping and out-of-range segments were removed;
- an invalid sound enum yielded an unavailable review with no invalid segment
  output; and
- the saved sound-analysis document contained no audio payload.

No annotators reviewed sound clips, so annotator agreement is not available.
The checks measure application-level shape/bounds enforcement, not acoustic
classification quality.

## Privacy and access-control evidence

All 10 local checks passed:

1. Missing authentication rejected (401).
2. Stranger infant access hidden (404).
3. Partner access to the maternal record denied (403).
4. Revoked AI consent blocked voice processing (`consent_required`).
5. Consent changes created an audit record containing purpose/grant state,
   without transcript/audio content.
6. Sound response stated raw audio was not retained.
7. Stored analysis documents had no audio payload.
8. Sound segments were clip-bounded and non-overlapping.
9. Invalid sound enum output was rejected.
10. Infant log deletion removed events/audio analyses while retaining the
    profile and recording a deletion audit event.

These checks ran against the in-memory seeded demo store. They do not verify
Firestore rules/retention, deployed service-account isolation, Firebase token
revocation, production audit export/immutability, or actual Cloud Logging
redaction. Those need a separate non-production cloud environment.

## Front-end build and one local browser observation

`npm run build` passed TypeScript checking and Vite production build; Vite
reported 2.32 seconds for its build step:

| Asset | Uncompressed | Gzip |
|---|---:|---:|
| Main JavaScript | 450.25 kB | 139.04 kB |
| Firebase JavaScript chunk | 180.49 kB | 36.79 kB |
| CSS | 56.85 kB | 11.58 kB |
| HTML | 1.03 kB | 0.52 kB |

One navigation to the local production preview measured `responseStart` 42 ms,
`DOMContentLoaded` 405 ms, and `load` 408 ms. Resource Timing reported 139,344
bytes transferred for the main JS, 11,881 for CSS, and 240,816 for the
newborn-image resource. A remote font stylesheet was also loaded. This is one
local browser observation—not a repeated/cold-device p95, mobile test, or
Core Web Vitals study. The Firebase chunk was generated by the build but was
not requested on the landing page.

## Validation and rerun artifacts

- Backend suite: `76 passed in 2.72s`.
- Frontend: `npm run build` passed.
- Benchmark harness syntax check: passed.
- Reproducible harness: `scripts/performance_study.py`.
- Raw machine-readable results: `docs/performance-study-results.json`.

## Separate benchmark still required

Before a pilot acceptance/load run:

1. Select the deployed test region/revision and record actual model/provider
   versions, runtime sizing, and network conditions.
2. Agree and record the p95/error-rate threshold **before** the load test; no
   threshold is inferred from this local baseline.
3. Use dedicated synthetic or explicitly consented accounts/data and record
   dataset size, distinct-user concurrency, request mix, ramp duration, and
   warm/cold conditions.
4. Exercise real authenticated API calls and real consented provider requests
   by task; record p50/p95/p99, 4xx/5xx, timeouts, provider errors, retries,
   quota outcomes, and cloud/provider cost.
5. Run the load steps while collecting service CPU/memory, instance scaling,
   Firestore latency/operations, and provider metrics.
6. Complete a blinded field-review/correction study and human sound-note
   validity/agreement study on independently labeled synthetic or consented
   evaluation data.
7. Verify deployed consent gates, account isolation, retention/deletion, and
   audit/log evidence against the actual cloud configuration.

The benchmark can establish system reliability and output validity under its
stated test conditions. It cannot establish clinical accuracy or diagnose a
baby.
