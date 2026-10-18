#!/usr/bin/env bash
# Deploy the Baby API and Mother API to Cloud Run with separate service accounts.
#   PROJECT=my-project CORS_ORIGINS=https://my-project.web.app ./scripts/deploy_cloud_run.sh
# Verify role names, model ids and regional availability against current Google docs.
set -euo pipefail
PROJECT="${PROJECT:?Set PROJECT to your Google Cloud project id}"
REGION="${REGION:-asia-south1}"
REPO="${REPO:-crysense}"
CORS_ORIGINS="${CORS_ORIGINS:?Set CORS_ORIGINS to your web app origin}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/crysense-api:$(date +%Y%m%d%H%M%S)"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  firestore.googleapis.com speech.googleapis.com aiplatform.googleapis.com --project "$PROJECT"
gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --project "$PROJECT" 2>/dev/null || true

# Least privilege: one service account per API.
for svc in baby mother; do
  SA="crysense-$svc@$PROJECT.iam.gserviceaccount.com"
  gcloud iam service-accounts create "crysense-$svc" --project "$PROJECT" --display-name "CrySense $svc API" 2>/dev/null || true
  for role in roles/datastore.user roles/aiplatform.user roles/speech.client roles/firebaseauth.viewer; do
    gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" --condition=None >/dev/null
  done
done

gcloud builds submit --project "$PROJECT" --config cloudbuild.yaml --substitutions=_IMAGE="$IMAGE" .

for svc in baby mother; do
  gcloud run deploy "crysense-$svc-api" \
    --image "$IMAGE" --region "$REGION" --project "$PROJECT" \
    --service-account "crysense-$svc@$PROJECT.iam.gserviceaccount.com" \
    --allow-unauthenticated \
    --set-env-vars "SERVICE=$svc,DATA_STORE=${DATA_STORE:-firestore},AI_PROVIDER=${AI_PROVIDER:-gemini},GEMINI_USE_VERTEX=true,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=${GEMINI_LOCATION:-global},GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.5-flash},SPEECH_PROVIDER=${SPEECH_PROVIDER:-google_stt},STT_LANGUAGE=${STT_LANGUAGE:-en-IN},AUTH_MODE=${AUTH_MODE:-firebase},CORS_ORIGINS=$CORS_ORIGINS"
done

echo "Baby API:   $(gcloud run services describe crysense-baby-api   --region "$REGION" --project "$PROJECT" --format 'value(status.url)')"
echo "Mother API: $(gcloud run services describe crysense-mother-api --region "$REGION" --project "$PROJECT" --format 'value(status.url)')"
