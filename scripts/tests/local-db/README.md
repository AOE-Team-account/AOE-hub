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

Each check prints what it expects (for example "expect permission denied").
Never run these files against the live database.
