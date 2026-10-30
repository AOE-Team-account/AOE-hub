# AOEhub virus scanner

A small service that checks every uploaded file for viruses with ClamAV (plus the
free extra signature sources from clamav-unofficial-sigs: Sanesecurity, Bofhland,
Winnow, Porcupine, interServer, Linux Malware Detect) and, when the file is clean,
moves it from the private staging bucket to its final place (the main R2 bucket, or
the Internet Archive for files over 50 MB).

Runs on Google Cloud Run (8 GB memory, scales to zero; you pay only while it works).

## What it refuses to let through
- anything ClamAV recognises as a virus, trojan, phishing page or malicious script
- a virus hidden inside a zip (nested up to 12 levels)
- password-protected archives (they cannot be checked)
- Office files with macros
- files the engine cannot fully inspect (too big, too many files inside)
- potentially unwanted programs

## Settings (given by `scripts/deploy-scanner.sh`, kept in Google Secret Manager)
SCANNER_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
R2_STAGING_BUCKET_NAME, IA_ACCESS_KEY, IA_SECRET_KEY, IA_BUCKET_NAME.

## Looking at it
- `GET /status` shows whether the engine is ready (Google keeps the word "healthz" for itself on Cloud Run, so it is not used).
- `GET /layers` (with the secret) lists the signature collections the engine has loaded.

## Deploy
From the project folder, after `gcloud auth login`:

    scripts/deploy-scanner.sh YOUR_PROJECT_ID us-central1

## Test it on your own computer (needs Docker)
    cd scanner && docker build -t aoehub-scanner:test .
    docker run -p 8080:8080 --env-file your-test.env aoehub-scanner:test
    curl localhost:8080/healthz

Limits: 2047 MB per file (ClamAV cannot scan 2 GiB or more). The hub's normal limit is 1 GB.

## Updating the scanner later
    SKIP_SETUP=1 scripts/deploy-scanner.sh YOUR_PROJECT_ID us-central1
sends only the new code (services, permissions and keys are already in place).

## Script-in-zip rules switched off

Sanesecurity's `Foxhole.JS_Zip_*` rules flag any zip that contains a `.js` file (made for email).
Games are zips of scripts, so `ignore-js-zip.sh` lists those rules in `aoehub-js-zip.ign2` at start and
every 10 minutes (so new rules of that family are covered). The scanner's own check in `inspect.mjs` still
refuses scripts inside zips for every post that is not a game or app.

## Wrong-secret lockout and lazy engine start

- An address that sends the wrong secret 5 times in 10 minutes gets an instant 429 for 30 minutes (kept in memory only).
- `start.sh` starts only the Node service at boot. The ClamAV engine starts when the first request with the right
  secret arrives (the service writes `/tmp/engine-wanted`). A stranger who wakes the scanner costs about a second.
- The scanner stays public to Google (a service-account key is blocked by the default organization policy); the secret is its lock.
