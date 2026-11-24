# Local database check of the security fixes (no live service)

A throwaway local PostgreSQL 17 (with pgvector) and a tiny stand-in for Supabase's
own objects (`supabase-stub.sql`: the anon/authenticated/service_role roles,
`auth.uid()`/`auth.role()`, a fake `vault`). Test data only (`a@example.com`).

```sh
createdb -h /tmp -p 55432 -U postgres aoe_test
psql -h /tmp -p 55432 -U postgres -d aoe_test -f scripts/tests/local-db/supabase-stub.sql
sed 's/^create extension if not exists supabase_vault;//' supabase/schema.sql | psql -h /tmp -p 55432 -U postgres -d aoe_test -v ON_ERROR_STOP=1 -q
psql -h /tmp -p 55432 -U postgres -d aoe_test -f scripts/tests/local-db/security-checks.sql
```

Also `content-limit-checks.sql` (SEC-05/12) and `round2-checks.sql` (SEC-25, INF-08, INF-10;
it reads every table as anon and as a member, so a policy helper that lost its
EXECUTE grant shows up as "function permission errors").

**Hard checks (AOE-INF-13):** `run-checks.sh` builds the databases itself and runs
`assert-checks.sql`, which STOPS with an error if a public table has RLS off, a hub
function is callable by strangers, a private helper is opened up, new functions are
not server-only, a private column is readable, or `require_server()` lets a call
without the service role through. CI runs the same script
(`.github/workflows/db-checks.yml`) in a throwaway database:

```sh
PGHOST=/tmp PGPORT=55432 PGUSER=postgres scripts/tests/local-db/run-checks.sh de8ac89
```

Each check prints what it expects (for example "expect permission denied").
Never run these files against the live database.
