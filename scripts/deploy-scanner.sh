#!/usr/bin/env bash
# Deploys the AOEhub virus scanner to Google Cloud Run.
#
#   scripts/deploy-scanner.sh YOUR_PROJECT_ID [REGION]
#
# Run it from the project folder, after `gcloud auth login`. It reads your keys
# from .env.local and puts them into Google's Secret Manager WITHOUT printing
# them, deploys the scanner, and writes SCANNER_URL (and, the first time,
# SCANNER_SECRET) back into .env.local. Safe to run again to deploy an update.
set -euo pipefail

PROJECT="${1:-}"
REGION="${2:-us-central1}"
SERVICE="aoehub-scanner"
ENV_FILE=".env.local"

if [ -z "$PROJECT" ]; then echo "Usage: scripts/deploy-scanner.sh YOUR_PROJECT_ID [REGION]"; exit 1; fi
if [ ! -f "$ENV_FILE" ] || [ ! -d scanner ]; then echo "Run this from the project folder (the one that contains scanner/ and .env.local)."; exit 1; fi
command -v gcloud >/dev/null || { echo "gcloud is not installed. See the setup steps."; exit 1; }

# Reads one value from .env.local (no printing).
val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# A shared secret between the hub and the scanner: made once, kept in .env.local.
if [ -z "$(val SCANNER_SECRET)" ] || [ "$(val SCANNER_SECRET)" = "a-long-random-secret" ]; then
  NEW="$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48)"
  grep -vE '^SCANNER_SECRET=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  printf 'SCANNER_SECRET=%s\n' "$NEW" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  echo "Made a new SCANNER_SECRET and saved it in $ENV_FILE."
fi

for k in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME R2_STAGING_BUCKET_NAME IA_ACCESS_KEY IA_SECRET_KEY SCANNER_SECRET; do
  if [ -z "$(val $k)" ]; then echo "Missing $k in $ENV_FILE. Add it and run again."; exit 1; fi
done

gcloud config set project "$PROJECT" >/dev/null

if [ "${SKIP_SETUP:-}" = "1" ]; then
  # Update only: send the new scanner code (services, permissions and keys are already in place).
  echo "Sending the updated scanner (settings, permissions and keys left as they are)..."
  gcloud run deploy "$SERVICE" --quiet --source scanner --region "$REGION" --memory 8Gi --cpu 2 --timeout 3600 --concurrency 2 --min-instances 0 --max-instances 3 --execution-environment gen2 --allow-unauthenticated
  echo "Updated."
  exit 0
fi
echo "Turning on the Google services the scanner needs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
# The helper account Google uses to build and run the scanner needs a few rights
# (a new project does not give them by default). Each one is the smallest that does the job:
#   secretAccessor   read the scanner's own keys when it starts
#   builds.builder   build the scanner's container
#   objectViewer     read the uploaded scanner code while building
#   artifactregistry.writer   save the built container
#   logWriter        write the scanner's log lines
for role in roles/secretmanager.secretAccessor roles/cloudbuild.builds.builder roles/storage.objectViewer roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$RUN_SA" --role="$role" --condition=None >/dev/null
done

echo "Saving your keys in Secret Manager (nothing is printed)..."
SECRETS=""
for k in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME R2_STAGING_BUCKET_NAME IA_ACCESS_KEY IA_SECRET_KEY SCANNER_SECRET; do
  name="aoehub-$(echo "$k" | tr 'A-Z_' 'a-z-')"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$(val $k)" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  else
    printf '%s' "$(val $k)" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic >/dev/null
  fi
  SECRETS="${SECRETS:+$SECRETS,}$k=$name:latest"
done

echo "Building and deploying the scanner (the first time takes several minutes)..."
gcloud run deploy "$SERVICE" \
  --quiet \
  --source scanner \
  --region "$REGION" \
  --memory 8Gi --cpu 2 \
  --timeout 3600 \
  --concurrency 2 \
  --min-instances 0 --max-instances 3 \
  --execution-environment gen2 \
  --allow-unauthenticated \
  --set-env-vars "IA_BUCKET_NAME=$(val IA_BUCKET_NAME)" \
  --set-secrets "$SECRETS"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
grep -vE '^SCANNER_URL=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
printf 'SCANNER_URL=%s\n' "$URL" >> "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"
echo
echo "Done. The scanner is at $URL (saved as SCANNER_URL in $ENV_FILE)."
echo "Tell Claude it is deployed; it will test it."
