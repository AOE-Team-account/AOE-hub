#!/usr/bin/env bash
# Makes the virus scanner PRIVATE: Google turns away every caller except the hub's own
# Google account (which can do nothing except call the scanner). Run once, from the
# project folder, after `gcloud auth login`:
#
#   scripts/lock-scanner.sh YOUR_PROJECT_ID [REGION]
#
# It makes that account, gives it the single right to call the scanner, makes its key
# (saved in .env.local as SCANNER_CALLER_KEY, never printed), and closes the public door.
set -euo pipefail
PROJECT="${1:-}"; REGION="${2:-us-central1}"; SERVICE="aoehub-scanner"; ENV_FILE=".env.local"
[ -n "$PROJECT" ] || { echo "Usage: scripts/lock-scanner.sh YOUR_PROJECT_ID [REGION]"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Run this from the project folder (it needs .env.local)."; exit 1; }
gcloud config set project "$PROJECT" >/dev/null
SA="aoehub-hub-caller"; EMAIL="$SA@$PROJECT.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA" --display-name="AOEhub hub (may only call the scanner)" >/dev/null
  echo "Made the account $EMAIL"
fi
gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" --member="serviceAccount:$EMAIL" --role="roles/run.invoker" >/dev/null
echo "It may now call the scanner (and nothing else)."

KEYFILE="$(mktemp)"
if ! gcloud iam service-accounts keys create "$KEYFILE" --iam-account="$EMAIL" >/dev/null 2>&1; then
  rm -f "$KEYFILE"
  echo
  echo "Google would not let me make a key for the account. Google switches that off by default on new"
  echo "accounts for safety. Nothing was changed on the public door; the scanner is still protected only"
  echo "by its secret. Tell Claude what happened and we will choose how to continue."
  exit 2
fi
B64="$(base64 < "$KEYFILE" | tr -d '\n')"
rm -f "$KEYFILE"
grep -vE '^SCANNER_CALLER_KEY=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
printf 'SCANNER_CALLER_KEY=%s\n' "$B64" >> "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"
echo "Saved the account's key in $ENV_FILE as SCANNER_CALLER_KEY (not printed)."

# Close the public door only now that the hub has its own way in.
gcloud run services remove-iam-policy-binding "$SERVICE" --region "$REGION" --member="allUsers" --role="roles/run.invoker" >/dev/null || true
echo
echo "Done. The scanner is now private: anyone else, anywhere, gets a refusal from Google before"
echo "the scanner even wakes up. Tell Claude, and it will test it."
