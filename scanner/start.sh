#!/usr/bin/env bash
# Starts the ClamAV engine (with the extra signature sources) and then the scanner service.
set -u
# Games are zips of scripts: switch off the email-oriented script-in-zip rules before the engine loads.
bash /app/ignore-js-zip.sh
/usr/local/sbin/cus-entrypoint.sh &
engine_pid=$!
trap 'kill -TERM "$engine_pid" 2>/dev/null; exit 0' TERM INT

# The extra signature sources are downloaded over the internet. If a run did not
# actually load them (judged by the files being there, not by the script's exit
# code), try again a few times instead of waiting hours.
# Keep that switch current after every signature update (the engine notices the change by itself).
(
  while true; do sleep 600; bash /app/ignore-js-zip.sh; done
) &

(
  for _ in 1 2 3 4 5 6; do
    sleep 90
    if [ -s /var/lib/clamav/phish.ndb ] && [ -s /var/lib/clamav/rfxn.ndb ]; then exit 0; fi
    bash /usr/local/sbin/clamav-unofficial-sigs.sh >/dev/null 2>&1 || true
  done
) &

node /app/server.mjs &
app_pid=$!
wait -n "$engine_pid" "$app_pid"
code=$?
kill -TERM "$engine_pid" "$app_pid" 2>/dev/null
exit "$code"
