-- Hard checks (AOE-INF-13 and the round 1-3 locks). Each one STOPS with an error when
-- it fails, so CI fails. Run on a TEST database only (fresh schema.sql, or old schema
-- + migrations), never on the live database:
--   psql ... -v ON_ERROR_STOP=1 -f scripts/tests/local-db/assert-checks.sql
\set ON_ERROR_STOP 1

-- 1. Every table in public has row-level security on (Supabase gives anon and members
--    SELECT on every new table by default, so RLS is what keeps a new table closed).
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if bad is not null then raise exception 'RLS is OFF on public table(s): %', bad; end if;
  raise notice 'ok: RLS on for every public table';
end $$;

-- 2. Strangers (anon) can run no hub function in public (extension functions such as
--    pgvector's are not the hub's and are skipped).
do $$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
  if bad is not null then raise exception 'anon can execute hub function(s): %', bad; end if;
  raise notice 'ok: anon can execute no hub function in public';
end $$;

-- 3. Private schema: only the six policy helpers are callable by anon / members (AOE-INF-08).
do $$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.proname not in ('author_is_active', 'can_participate', 'creator_unlocked', 'is_reviewer', 'report_kind', 'reviewer_can');
  if bad is not null then raise exception 'private function(s) callable by anon/members: %', bad; end if;
  raise notice 'ok: only the 6 policy helpers in private are callable by anon/members';
end $$;

-- 4. Functions created after setup are server-only (default privileges, SEC-07 / INF-08).
create or replace function public.zz_assert_new_fn() returns int language sql as $$ select 1 $$;
create or replace function private.zz_assert_new_fn() returns int language sql as $$ select 1 $$;
do $$
begin
  if has_function_privilege('anon', 'public.zz_assert_new_fn()', 'execute')
     or has_function_privilege('authenticated', 'public.zz_assert_new_fn()', 'execute')
     or has_function_privilege('anon', 'private.zz_assert_new_fn()', 'execute')
     or has_function_privilege('authenticated', 'private.zz_assert_new_fn()', 'execute') then
    raise exception 'a NEW function is callable by anon/members (default privileges)';
  end if;
  raise notice 'ok: new functions are server-only by default';
end $$;
drop function public.zz_assert_new_fn();
drop function private.zz_assert_new_fn();

-- 5. Private columns stay private (SEC-03, SEC-25).
do $$
begin
  if has_column_privilege('anon', 'public.profiles', 'region', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'region', 'select')
     or has_column_privilege('anon', 'public.file_assets', 'final_key', 'select')
     or has_column_privilege('authenticated', 'public.file_assets', 'storage_path', 'select') then
    raise exception 'a private column of profiles / file_assets is readable by anon or members';
  end if;
  raise notice 'ok: private profile and file storage columns are not readable';
end $$;

-- 6. require_server() refuses a call with no role and with a website role (INF-10).
do $$
declare refused int := 0;
begin
  perform set_config('request.jwt.claims', '', true);
  begin perform private.require_server(); exception when insufficient_privilege then refused := refused + 1; end;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin perform private.require_server(); exception when insufficient_privilege then refused := refused + 1; end;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform private.require_server(); -- must pass
  perform set_config('request.jwt.claims', '', true);
  if refused <> 2 then raise exception 'require_server() let a call without the service role through'; end if;
  raise notice 'ok: require_server() allows only service_role';
end $$;

-- 7. Functions the new app code calls exist (SEC-26: they must be there before the deploy).
do $$
begin
  perform 'public.my_profile()'::regprocedure;
  perform 'public.create_file_post(uuid, text, text, text, text, text, uuid, boolean)'::regprocedure;
  perform 'public.take_rate_limit(text, integer, integer)'::regprocedure;
  raise notice 'ok: functions the new code calls exist';
end $$;

\echo ALL HARD CHECKS PASSED
