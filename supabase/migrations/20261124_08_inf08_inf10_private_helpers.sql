-- AOE-INF-08: functions in the private schema are callable by the server only,
-- except the six helpers that row-level-security policies use (a policy runs as
-- the visitor, so the visitor needs EXECUTE on those). New private functions are
-- server-only by default.
-- AOE-INF-10: private.require_server() now refuses a call with no role at all.
-- To run a server-only function by hand in the SQL editor, put this first in
-- the same query:
--   select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- Must run AFTER 20261124_03 (which created require_server). Safe to run more
-- than once. Mirrors supabase/schema.sql (top: default privileges and
-- require_server; very end: "Private helpers").

alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private grant execute on functions to service_role;

create or replace function private.require_server()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
grant execute on function private.author_is_active(uuid) to anon, authenticated;
grant execute on function private.can_participate(uuid) to anon, authenticated;
grant execute on function private.creator_unlocked(boolean) to anon, authenticated;
grant execute on function private.is_reviewer(uuid) to anon, authenticated;
grant execute on function private.report_kind(text) to anon, authenticated;
grant execute on function private.reviewer_can(uuid, text, text) to anon, authenticated;

-- Check (expect only the six helpers above):
-- select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute');
