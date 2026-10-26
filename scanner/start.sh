#!/usr/bin/env bash
# Starts the ClamAV engine (with the extra signature sources) and then the scanner service.
set -u
/usr/local/sbin/cus-entrypoint.sh &
engine_pid=$!
trap 'kill -TERM "$engine_pid" 2>/dev/null; exit 0' TERM INT

# The extra signature sources are downloaded over the internet; if the first
# download fails (a hiccup), try again a few times instead of waiting hours.
(
  for _ in 1 2 3 4 5 6; do
    sleep 90
    if [ -f /tmp/cus-status ] && [ "$(awk '{print $2}' /tmp/cus-status)" = "0" ]; then exit 0; fi
    bash /usr/local/sbin/clamav-unofficial-sigs.sh >/dev/null 2>&1 && exit 0
  done
) &

node /app/server.mjs &
app_pid=$!
wait -n "$engine_pid" "$app_pid"
code=$?
kill -TERM "$engine_pid" "$app_pid" 2>/dev/null
exit "$code"
