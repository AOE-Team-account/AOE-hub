-- Round 2 checks (AOE-SEC-25, AOE-INF-08, AOE-INF-10). Local test database only.
\set ON_ERROR_STOP 0
-- Seed rows (as the database owner) so the row rules really run during the checks.
insert into auth.users (id, email, raw_user_meta_data) values ('11111111-1111-4111-8111-111111111111','a@example.com','{"name":"Alice","age_attested_min":13,"accepted_terms":true}') on conflict do nothing;
do $$
declare fp uuid; ep uuid;
begin
  if not exists (select 1 from public.file_posts where title = 'round2-seed') then
    insert into public.file_posts (author_id,title,description,section,media_type,authorship)
      values ('11111111-1111-4111-8111-111111111111','round2-seed','d','curriculum','document','original') returning id into fp;
    insert into public.file_assets (file_post_id, label, scan_status, storage_path, storage_backend)
      values (fp, 'seed.pdf', 'clean', 'seed/key.pdf', 'r2');
    insert into public.experience_posts (author_id, category, title, body)
      values ('11111111-1111-4111-8111-111111111111','reflections','t','hello') returning id into ep;
    insert into public.comments (parent_type,parent_id,author_id,type,body)
      values ('experience-post',ep,'11111111-1111-4111-8111-111111111111','sharing','c');
  end if;
end $$;
\echo [INF-08] private functions anon may execute (expect exactly 6 policy helpers):
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute') order by 1;
\echo [INF-08] private functions authenticated may execute (expect the same 6):
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute');
\echo [INF-08] new private function after setup: anon/auth/service (expect f f t):
create or replace function private.zz_new_helper() returns int language sql as $$ select 1 $$;
select has_function_privilege('anon','private.zz_new_helper()','execute'), has_function_privilege('authenticated','private.zz_new_helper()','execute'), has_function_privilege('service_role','private.zz_new_helper()','execute');
drop function private.zz_new_helper();

\echo [INF-10] server-only function with NO role (expect Not allowed):
select set_config('request.jwt.claims', '', false);
select count(*) from public.hub_ai_key_secrets();
\echo [INF-10] same with the service_role claim (expect a count):
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select count(*) from public.hub_ai_key_secrets();
select set_config('request.jwt.claims', '', false);

\echo [SEC-25] anon column rights (expect label t, final_key f, staging_key f, storage_path f, game_prefix f, staged_etag f):
select has_column_privilege('anon','public.file_assets','label','select') label,
       has_column_privilege('anon','public.file_assets','final_key','select') final_key,
       has_column_privilege('anon','public.file_assets','staging_key','select') staging_key,
       has_column_privilege('anon','public.file_assets','storage_path','select') storage_path,
       has_column_privilege('anon','public.file_assets','game_prefix','select') game_prefix,
       has_column_privilege('anon','public.file_assets','staged_etag','select') staged_etag;
set role anon; select set_config('request.jwt.claims','{"role":"anon"}',false);
\echo [SEC-25] anon reads the display columns the app uses (expect count 1 for the seed file, no error):
select count(*) from (select id, file_post_id, label, mime_type, downloads, scan_status, size_bytes, is_link, link_url, is_game from public.file_assets) x;
\echo [SEC-25] anon reads storage_path (expect permission denied):
select storage_path from public.file_assets limit 1;
reset role;

\echo [policies] every readable public table as anon and as a member (expect no "permission denied for function"):
do $$
declare t record; r text; n int := 0; bad int := 0;
begin
  foreach r in array array['anon','authenticated'] loop
    for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
              where s.nspname = 'public' and c.relkind in ('r','v') loop
      if has_table_privilege(r, 'public.' || quote_ident(t.relname), 'select') then
        begin
          perform set_config('request.jwt.claims', case r when 'anon' then '{"role":"anon"}'
            else '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}' end, true);
          execute format('set local role %I', r);
          execute format('select count(*) from public.%I', t.relname);
          n := n + 1;
          reset role;
        exception when others then
          reset role;
          if sqlerrm like '%function%' then bad := bad + 1; raise notice '% on %: %', r, t.relname, sqlerrm; end if;
        end;
      end if;
    end loop;
  end loop;
  raise notice 'tables read: %, function permission errors: %', n, bad;
end $$;
