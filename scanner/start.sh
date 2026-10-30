#!/usr/bin/env bash
# Starts the scanner service right away, and the ClamAV engine (with the extra signature sources)
# only once someone with the right secret has asked for a scan. A stranger who wakes the scanner
# therefore costs about a second, not the 20 seconds the engine needs to load.
set -u
rm -f /tmp/engine-wanted
node /app/server.mjs &
app_pid=$!
engine_pid=""
trap 'kill -TERM $app_pid ${engine_pid:+$engine_pid} 2>/dev/null; exit 0' TERM INT

until [ -e /tmp/engine-wanted ]; do
  kill -0 "$app_pid" 2>/dev/null || exit 1
  sleep 0.2
done

# Games are zips of scripts: switch off the email-oriented script-in-zip rules before the engine loads.
bash /app/ignore-js-zip.sh
/usr/local/sbin/cus-entrypoint.sh &
engine_pid=$!

# Keep that switch current after every signature update (the engine notices the change by itself).
(
  while true; do sleep 600; bash /app/ignore-js-zip.sh; done
) &

# The extra signature sources are downloaded over the internet. If a run did not
# actually load them (judged by the files being there, not by the script's exit
# code), try again a few times instead of waiting hours.
(
  for _ in 1 2 3 4 5 6; do
    sleep 90
    if [ -s /var/lib/clamav/phish.ndb ] && [ -s /var/lib/clamav/rfxn.ndb ]; then exit 0; fi
    bash /usr/local/sbin/clamav-unofficial-sigs.sh >/dev/null 2>&1 || true
  done
) &

wait -n "$engine_pid" "$app_pid"
code=$?
kill -TERM "$engine_pid" "$app_pid" 2>/dev/null
exit "$code"
