# Google integration guide

Switch each mock to a Google service one at a time. Every step is independent, so you can demo with Gemini while still on the in-memory store, for example.

> Product names, model ids, IAM role names, pricing and regional availability change. Check each against the official documentation before you deploy.

## 0. Prerequisites

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT
gcloud auth application-default login     # local credentials for the Google client libraries
cd backend && pip install -r requirements-dev.txt -r requirements-google.txt
```

## 1. Gemini (structured extraction and journal reflection)

**Option A: Gemini API key (fastest for a hackathon)**

1. Create a key in Google AI Studio.
2. Set:

```bash
AI_PROVIDER=gemini
GEMINI_USE_VERTEX=false
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash     # pick a current model from the docs
```

**Option B: Vertex AI (production)**

```bash
gcloud services enable aiplatform.googleapis.com
AI_PROVIDER=gemini
GEMINI_USE_VERTEX=true
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT
GOOGLE_CLOUD_LOCATION=global
```

What the code does (`backend/crysense/ai/gemini_provider.py`):

- Calls `client.models.generate_content` with `response_mime_type="application/json"` and a Pydantic `response_schema` (`ExtractedEvent`, `JournalReflection`), temperature 0.1.
- System prompts (`ai/prompts.py`) forbid guessing values, diagnosing or scoring.
- After Gemini returns, deterministic code validates every value, and `ai/guards.py` removes clinical labels from reflections.

Try it:

```bash
curl -s -X POST localhost:8081/v1/infants/inf_anya/voice-log \
  -H "Authorization: Bearer mock-u_meera" -F transcript="Fed 90 ml formula at 8 pm" | jq
```

## 2. Speech-to-Text V2 (voice log and journal)

```bash
gcloud services enable speech.googleapis.com
SPEECH_PROVIDER=google_stt
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT
STT_LANGUAGE=en-IN               # hi-IN, ta-IN ...
```

`crysense/speech/google_stt.py` uses the default recognizer `projects/{project}/locations/global/recognizers/_` with `AutoDetectDecodingConfig` and model `long`. The browser records 16 kHz mono WAV, which STT accepts directly.

Alternative: `SPEECH_PROVIDER=gemini` sends the WAV to Gemini for transcription. Compare both on critical fields (amounts, times, medicine names) before choosing.

## 3. Firebase Authentication

1. In the Firebase console, add a Web app and enable **Google**, **Email link (passwordless sign-in)**, and **Phone** providers.
2. In Authentication settings, authorize your Hosting domain and allow the SMS regions you serve (India is enabled for CrySense). Web phone sign-in uses Firebase's reCAPTCHA verifier; it does not require a separate reCAPTCHA site key.
3. Real phone verification SMS is pay-as-you-go on Blaze. For free development tests, configure fictional phone numbers and codes in Firebase Authentication; those tests send no SMS. Never leave known test credentials enabled for public use.
4. Frontend `.env`:

```bash
VITE_AUTH_MODE=firebase
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT
VITE_FIREBASE_APP_ID=...
```

5. Backend: `AUTH_MODE=firebase`. `crysense/auth.py` verifies each ID token with `firebase_admin.auth.verify_id_token(token, check_revoked=True)`.
6. Link the signed-in user to records: create `users/{uid}`, and add the uid to `infantRecords/{id}.caregiverUids` or set it as `maternalRecords/{id}.ownerUid`. `/v1/me` then returns the right ids. Onboarding endpoints create the baby and optional mother profiles.

Optional: add **Firebase App Check** to the web app and verify App Check tokens on Cloud Run.

## 4. Cloud Firestore

```bash
gcloud services enable firestore.googleapis.com
gcloud firestore databases create --location=asia-south1
DATA_STORE=firestore
```

- `crysense/store/firestore_store.py` uses the same paths as the memory store (see [DATA_MODEL.md](DATA_MODEL.md)).
- Seed demo data once: `python -c "from crysense.store.firestore_store import FirestoreStore; from crysense.store.seed import seed_store; seed_store(FirestoreStore())"`
- Deploy rules: `cd firebase && firebase deploy --only firestore:rules,storage`. They deny all direct browser access; the APIs use their service accounts.
- Local emulator: `firebase emulators:start` and `FIRESTORE_EMULATOR_HOST=localhost:8080`.

## 5. YAMNet cry presence (optional)

```bash
pip install -r requirements-ml.txt
CRY_MODEL=yamnet
```

`crysense/audio/cry_presence.py` loads YAMNet from TF Hub, finds the AudioSet class **"Baby cry, infant cry"** by name, and returns detected / not detected / uncertain with thresholds you must tune on an audited, licensed evaluation set. It never outputs a cause. TensorFlow makes the image large, so build a separate image if you enable it.

## 6. Cloud Run (both APIs)

```bash
PROJECT=YOUR_PROJECT CORS_ORIGINS=https://YOUR_PROJECT.web.app ./scripts/deploy_cloud_run.sh
```

The script:

1. Enables Run, Artifact Registry, Cloud Build, Firestore, Speech and Vertex AI.
2. Creates **two service accounts** (`crysense-baby`, `crysense-mother`) with `roles/datastore.user`, `roles/aiplatform.user`, `roles/speech.client` and `roles/firebaseauth.viewer`. Tighten further for production.
3. Builds one image with Cloud Build (`cloudbuild.yaml`, built from the repository root so `/shared` is included).
4. Deploys `crysense-baby-api` and `crysense-mother-api` with `SERVICE=baby` / `SERVICE=mother`, Firestore, Gemini on Vertex AI, Speech-to-Text and Firebase auth.

Services are `--allow-unauthenticated` at the network level because every request is authenticated in code with a Firebase ID token. Add App Check or an API gateway if you need more.

## 7. Firebase Hosting (web app)

```bash
cd frontend
cat > .env.production <<EOF
VITE_API_MODE=live
VITE_AUTH_MODE=firebase
VITE_BABY_API_URL=https://crysense-baby-api-xxxx.a.run.app
VITE_MOTHER_API_URL=https://crysense-mother-api-xxxx.a.run.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
EOF
npm run build
cd ../firebase && firebase deploy --only hosting
```

Hosting adds `Permissions-Policy: microphone=(self)` and other headers (`firebase/firebase.json`).

## 8. Observability

### Local HTTPS Proxy Trust

The Vite `/demo-api` proxy verifies upstream TLS using Node's default and Windows system certificate authorities where `tls.getCACertificates` is available. This avoids empty proxy errors behind a trusted corporate inspection certificate without disabling certificate verification. Transport failures return a JSON `502` message from Emi. Restart Vite after changing its proxy configuration; on OneDrive use `CHOKIDAR_USEPOLLING=true` if native file watchers encounter `EBUSY`.

### Request Logging

- Cloud Logging receives one line per request: service, method, route template, status, latency. No bodies, audio or transcripts (`crysense/logging_utils.py`).
- Add Cloud Monitoring alerts on 5xx rate and p95 latency per service.
- Track model and ruleset versions: every cry analysis stores `modelVersion`, and every safety result returns `rulesetVersion`.

## Checklist before showing real users

- [ ] Clinician review of `shared/rules/*` and the India-specific Help content
- [ ] Support numbers in `shared/content/support_v1.json` verified with official sources
- [ ] Approved, licensed, translated questionnaire replacing the placeholder
- [ ] Firestore rules tests in the emulator; cross-account and revoked-consent tests against the deployed APIs
- [ ] Data-processing terms, region and retention reviewed for Gemini and Speech-to-Text with health content
- [ ] Model ids and IAM role names confirmed against current documentation
