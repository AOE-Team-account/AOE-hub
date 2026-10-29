#!/usr/bin/env bash
# Sanesecurity's "script inside a zip" rules (Foxhole.JS_Zip_*) are made for email, where a
# script in a zip is nearly always malware. Games on the hub are zips full of .js files,
# so those rules would reject every game. We switch off only that family of rules;
# the scanner's own check (inspect.mjs) still refuses scripts inside zips for every post
# that is not a game or app. Run at start and after every signature update, so newly
# added rules of the same family are covered too.
DB=/var/lib/clamav
OUT="$DB/aoehub-js-zip.ign2"
NEW="$(cat "$DB"/foxhole_*.cdb 2>/dev/null | grep -oE '^Sanesecurity\.Foxhole\.JS_Zip_[0-9A-Za-z_]*' | sort -u)"
if [ "$NEW" != "$(cat "$OUT" 2>/dev/null)" ]; then
  printf '%s' "$NEW" > "$OUT.tmp"; [ -n "$NEW" ] && echo >> "$OUT.tmp"
  mv "$OUT.tmp" "$OUT"; chown clamav:clamav "$OUT" 2>/dev/null || true
fi
