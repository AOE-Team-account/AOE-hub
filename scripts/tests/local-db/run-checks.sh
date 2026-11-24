#!/usr/bin/env bash
# Builds throwaway TEST databases and runs the hard checks (assert-checks.sql).
# Uses the usual libpq settings (PGHOST, PGPORT, PGUSER, PGPASSWORD) of a TEST
# PostgreSQL 17 with pgvector. NEVER point this at the live database.
#
#   scripts/tests/local-db/run-checks.sh            # fresh schema.sql (twice) + checks
#   scripts/tests/local-db/run-checks.sh de8ac89    # also: old schema at that commit
#                                                   # + every migration, twice, + checks
set -euo pipefail
cd "$(dirname "$0")/../../.."
here=scripts/tests/local-db
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
strip_vault() { sed 's/^create extension if not exists supabase_vault;/-- (vault stubbed for the test)/' "$1"; }

fresh_db() {
  "${PSQL[@]}" -d postgres -c "drop database if exists $1" -c "create database $1"
  "${PSQL[@]}" -d "$1" -f "$here/supabase-stub.sql" >/dev/null 2>&1 || "${PSQL[@]}" -d "$1" -f "$here/supabase-stub.sql" >/dev/null
}

echo "== fresh: supabase/schema.sql, twice"
fresh_db aoe_check_fresh
for _ in 1 2; do strip_vault supabase/schema.sql | "${PSQL[@]}" -d aoe_check_fresh 2>&1 | { grep -v NOTICE || true; }; done
"${PSQL[@]}" -d aoe_check_fresh -f "$here/assert-checks.sql"

if [ "${1:-}" != "" ]; then
  echo "== old schema at $1 + all migrations, twice"
  fresh_db aoe_check_old
  git show "$1:supabase/schema.sql" > /tmp/aoe-old-schema.sql
  strip_vault /tmp/aoe-old-schema.sql | "${PSQL[@]}" -d aoe_check_old 2>&1 | { grep -v NOTICE || true; }
  for _ in 1 2; do
    for f in supabase/migrations/2026*.sql; do "${PSQL[@]}" -d aoe_check_old -f "$f" 2>&1 | { grep -v NOTICE || true; }; done
  done
  "${PSQL[@]}" -d aoe_check_old -f "$here/assert-checks.sql"
fi
echo "== done"
