\set ON_ERROR_STOP 0
insert into auth.users (id, email, raw_user_meta_data) values ('11111111-1111-4111-8111-111111111111','a@example.com','{"name":"Alice","age_attested_min":13,"accepted_terms":true}') on conflict do nothing;
update public.profiles set region='china', onboarding_experience='homeschooling' where id='11111111-1111-4111-8111-111111111111';
-- anon
set role anon; select set_config('request.jwt.claims','{"role":"anon"}',false);
\echo [anon] public columns (expect row):
select name from public.profiles limit 1;
\echo [anon] region (expect permission denied):
select region from public.profiles limit 1;
\echo [anon] filter on region (expect permission denied):
select id from public.profiles where region='china';
\echo [anon] file_posts via policy helpers (expect 0 rows, no error):
select count(*) from public.file_posts;
\echo [anon] hub_ai_key_secrets (expect permission denied):
select * from public.hub_ai_key_secrets();
reset role;
-- authenticated owner
set role authenticated; select set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',false);
\echo [owner] my_profile region (expect china):
select region from public.my_profile();
\echo [owner] update own region (expect UPDATE 1):
update public.profiles set region='world' where id='11111111-1111-4111-8111-111111111111';
reset role;
\echo [guard] grant hub_ai_key_secrets to anon by mistake, then call as anon (expect Not allowed):
grant execute on function public.hub_ai_key_secrets(boolean) to anon;
set role anon; select set_config('request.jwt.claims','{"role":"anon"}',false);
select * from public.hub_ai_key_secrets();
reset role;
revoke execute on function public.hub_ai_key_secrets(boolean) from anon;
\echo [guard] service role call (expect 0 rows OK):
set role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',false);
select count(*) from public.hub_ai_key_secrets();
\echo [clamp] purge_expired(0) logs days 30:
select public.purge_expired(0);
\echo [kb] kb_cleanup_models(empty) (expect error):
select public.kb_cleanup_models('{}');
reset role; select set_config('request.jwt.claims','',false);
\echo [defaults] new function after setup: anon/auth can execute? (expect f f), service t:
create or replace function public.zz_new_fn() returns int language sql as $$ select 1 $$;
select has_function_privilege('anon','public.zz_new_fn()','execute') anon_can, has_function_privilege('authenticated','public.zz_new_fn()','execute') user_can, has_function_privilege('service_role','public.zz_new_fn()','execute') svc;
create or replace function private.zz_helper() returns int language sql as $$ select 1 $$;
\echo [defaults] new private helper callable by anon (expect t):
select has_function_privilege('anon','private.zz_helper()','execute');
drop function public.zz_new_fn(); drop function private.zz_helper();
