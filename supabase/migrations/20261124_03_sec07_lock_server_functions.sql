-- AOE-SEC-07: server-only database functions are locked one by one, check the
-- caller themselves, and new functions are no longer callable by everyone by default.
--  * hub_ai_key_secrets, get_user_ai_key, kb_pending_documents, kb_cleanup_models and
--    purge_expired refuse any call from the website (anon/authenticated) inside the function.
--  * purge_expired / list_expired_storage never use less than 30 days.
--  * kb_cleanup_models refuses an empty keep-list (it used to wipe the AI index).
--  * Each server-only function: EXECUTE revoked from public/anon/authenticated, granted to service_role.
-- Safe to run more than once. Run it in the Supabase SQL editor (as the postgres user).
-- The function bodies below are copied from supabase/schema.sql (keep them in step).

-- AOE-SEC-07: a new function is NOT callable from the browser until it is
-- granted on purpose. Postgres (and Supabase) give EXECUTE on every new function
-- to everyone by default; these lines turn that off for functions created from
-- now on (the sweep near the end of this file still re-locks existing ones).
-- Helpers in the private schema stay usable by row-level-security policies.
-- (Run as postgres, as the Supabase SQL editor does. Functions created by the
-- platform's own supabase_admin role are not covered; the hub never creates any.)
-- Postgres's built-in "everyone may execute" default can only be removed globally:
alter default privileges for role postgres revoke execute on functions from public;
-- Supabase's own per-schema defaults (EXECUTE to anon and authenticated in public):
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;
-- New functions in the private schema are server-only (AOE-INF-08; the same lines as
-- migration 08, so re-running this file after 08 changes nothing, AOE-SEC-27). The six
-- helpers that policies use are granted one by one in 08.
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private grant execute on functions to service_role;

-- First line of every server-only function (AOE-SEC-07). Only the hub's server
-- (service_role) passes; the website's roles and a call with no role at all are
-- refused (AOE-INF-10). This is the same, latest version as in migration 08 and
-- schema.sql, so the order the files are (re-)run in doesn't matter (AOE-SEC-27).
-- To run a server-only function by hand in the SQL editor, put this first:
--   select set_config('request.jwt.claims', '{"role":"service_role"}', true);

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

create or replace function public.record_view(
  p_target_type text,
  p_target_id uuid,
  p_viewer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_new_view_today boolean;
begin
  -- The counter only moves for a genuinely new view (this viewer, this
  -- content, today), not on every page load or refresh.
  insert into public.post_views (target_type, target_id, viewer_id)
  values (p_target_type, p_target_id, p_viewer_id)
  on conflict do nothing
  returning true into is_new_view_today;

  if not coalesce(is_new_view_today, false) then
    return;
  end if;

  if p_target_type = 'file' then
    update public.file_posts set views = views + 1 where id = p_target_id;
  elsif p_target_type = 'experience-post' then
    update public.experience_posts set views = views + 1 where id = p_target_id;
  else
    raise exception 'record_view: unsupported target_type %', p_target_type;
  end if;
end;
$$;
revoke execute on function public.record_view(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_view(text, uuid, uuid) to service_role;

create or replace function public.record_download(p_asset_id uuid, p_downloader_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_new_today boolean;
begin
  -- One counted download per person per file per day, so scripted repeat
  -- downloads cannot inflate the counter. (Server-only function.)
  insert into public.post_views (target_type, target_id, viewer_id)
  values ('download', p_asset_id, p_downloader_id)
  on conflict do nothing
  returning true into is_new_today;
  if not coalesce(is_new_today, false) then
    return;
  end if;

  update public.file_assets set downloads = downloads + 1 where id = p_asset_id;
end;
$$;
revoke execute on function public.record_download(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_download(uuid, uuid) to service_role;

create or replace function public.kb_pending_documents(p_model text, p_limit integer default 1)
returns table (id uuid, title text, content text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform private.require_server();
  return query
  select d.id, d.title, d.content
    from public.kb_documents d
   where not exists (select 1 from public.kb_document_models m where m.document_id = d.id and m.model = p_model)
   order by d.created_at, d.id
   limit greatest(p_limit, 1);
end;
$$;
revoke execute on function public.kb_pending_documents(text, integer) from public, anon, authenticated;
grant execute on function public.kb_pending_documents(text, integer) to service_role;

create or replace function public.kb_cleanup_models(p_keep text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform private.require_server();
  -- An empty list would wipe the AI's whole index (AOE-SEC-07).
  if p_keep is null or cardinality(p_keep) = 0 then
    raise exception 'kb_cleanup_models needs at least one model to keep.';
  end if;
  delete from public.kb_chunks where embedding_model is null or embedding_model <> all (p_keep);
  get diagnostics v_n = row_count;
  delete from public.kb_document_models where model <> all (p_keep);
  return v_n;
end;
$$;
revoke execute on function public.kb_cleanup_models(text[]) from public, anon, authenticated;
grant execute on function public.kb_cleanup_models(text[]) to service_role;

create or replace function public.get_user_ai_key(p_user_id uuid)
returns table (provider text, model text, api_key text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform private.require_server();
  return query
  select s.provider, s.model, v.decrypted_secret
  from public.user_ai_settings s
  join vault.decrypted_secrets v on v.id = s.vault_secret_id
  where s.user_id = p_user_id;
end;
$$;
revoke execute on function public.get_user_ai_key(uuid) from public, anon, authenticated;
grant execute on function public.get_user_ai_key(uuid) to service_role;

create or replace function public.hub_ai_key_secrets(p_only_active boolean default true)
returns table (id uuid, provider text, label text, api_key text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  -- Returns the hub's decrypted AI keys: server only, checked here too (AOE-SEC-07).
  perform private.require_server();
  return query
  select k.id, k.provider, k.label, v.decrypted_secret
    from public.hub_ai_keys k
    join vault.decrypted_secrets v on v.id = k.vault_secret_id
   where (not p_only_active or k.active)
   order by k.sort_order;
end;
$$;
revoke execute on function public.hub_ai_key_secrets(boolean) from public, anon, authenticated;
grant execute on function public.hub_ai_key_secrets(boolean) to service_role;

create or replace function public.record_hub_ai_key_check(p_id uuid, p_ok boolean, p_note text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.hub_ai_keys set last_check_at = now(), last_check_ok = p_ok, last_check_note = left(p_note, 200) where id = p_id;
$$;
revoke execute on function public.record_hub_ai_key_check(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_hub_ai_key_check(uuid, boolean, text) to service_role;

create or replace function public.purge_expired(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Never less than 30 days, whatever is asked (AOE-SEC-07): purge_expired(0) used to erase the whole trash.
  v_days integer := greatest(coalesce(p_days, 30), 30);
  v_cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 30));
  v_files integer;
  v_posts integer;
  v_comments integer;
  v_accounts integer;
  v_ids uuid[];
begin
  perform private.require_server();
  delete from public.file_posts where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_files = row_count;
  delete from public.experience_posts where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_posts = row_count;
  delete from public.comments where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_comments = row_count;
  -- An account deleted more than p_days ago (by the member or by the Creator) goes
  -- completely: its warnings, restrictions, reports about it and the activity-log
  -- entries about it, then the account itself (which takes everything it owns).
  select array_agg(id) into v_ids from public.profiles where account_status = 'deleted' and account_status_changed_at < v_cutoff;
  if v_ids is not null then
    perform set_config('app.purge_ok', 'on', true);
    delete from public.reports where (target_type in ('user', 'profile-picture') and target_id = any (v_ids))
       or (target_type = 'file' and target_id in (select id from public.file_posts where author_id = any (v_ids)))
       or (target_type = 'experience-post' and target_id in (select id from public.experience_posts where author_id = any (v_ids)))
       or (target_type = 'comment' and target_id in (select id from public.comments where author_id = any (v_ids)));
    delete from public.warnings where user_id = any (v_ids);
    delete from public.restrictions where user_id = any (v_ids);
    delete from public.account_referrals where user_id = any (v_ids);
    delete from public.activity_log where subject_user_id = any (v_ids) and action <> 'purge';
    perform set_config('app.purge_ok', 'off', true);
  end if;
  -- Removing the auth user cascades to the profile and everything it owns.
  delete from auth.users where id = any (coalesce(v_ids, '{}'::uuid[]));
  get diagnostics v_accounts = row_count;

  if v_files + v_posts + v_comments + v_accounts > 0 then
    perform private.log_activity(null, 'purge', null, null, null, null,
      jsonb_build_object('file_posts', v_files, 'posts', v_posts, 'comments', v_comments, 'accounts', v_accounts, 'days', v_days));
  end if;
  return jsonb_build_object('file_posts', v_files, 'posts', v_posts, 'comments', v_comments, 'accounts', v_accounts);
end;
$$;
revoke execute on function public.purge_expired(integer) from public, anon, authenticated;
grant execute on function public.purge_expired(integer) to service_role;

create or replace function public.get_upload_max_file(p_user uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'normal', coalesce((select case when jsonb_typeof(value) = 'number' then (value)::numeric::bigint end from public.hub_settings where key = 'upload_max_file_bytes'), 1073741824),
    'once', (select one_time_max_file_bytes from public.member_upload_limits where user_id = p_user),
    'unlimited', private.has_role(p_user, 'creator')
  );
$$;
revoke execute on function public.get_upload_max_file(uuid) from public, anon, authenticated;
grant execute on function public.get_upload_max_file(uuid) to service_role;

create or replace function public.claim_scan(p_asset uuid)
returns setof public.file_assets
language sql
security definer
volatile
set search_path = public
as $$
  update public.file_assets
     set scan_started_at = now(), scan_attempts = scan_attempts + 1
   where id = p_asset and scan_status = 'pending'
     and (scan_started_at is null or scan_started_at < now() - interval '30 minutes')
  returning *;
$$;
revoke execute on function public.claim_scan(uuid) from public, anon, authenticated;
grant execute on function public.claim_scan(uuid) to service_role;

create or replace function public.consume_one_time_max(p_user uuid)
returns void
language sql
security definer
volatile
set search_path = public
as $$
  update public.member_upload_limits set one_time_max_file_bytes = null, updated_at = now() where user_id = p_user;
$$;
revoke execute on function public.consume_one_time_max(uuid) from public, anon, authenticated;
grant execute on function public.consume_one_time_max(uuid) to service_role;

create or replace function public.list_expired_storage(p_days integer default 30)
returns table (asset_id uuid, storage_backend text, storage_path text, game_prefix text)
language sql
security definer
stable
set search_path = public
as $$
  select a.id, a.storage_backend, a.storage_path, a.game_prefix
    from public.file_assets a
    join public.file_posts p on p.id = a.file_post_id
   where (a.storage_path is not null or a.game_prefix is not null)
     and (
       (p.deleted_at is not null and p.deleted_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 30)))
       or exists (select 1 from public.profiles pr
                   where pr.id = p.author_id and pr.account_status = 'deleted'
                     and pr.account_status_changed_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 30)))
     )
  union all
  select pr.id, 'r2'::text, pr.avatar_path, null::text
    from public.profiles pr
   where pr.avatar_path is not null and pr.account_status = 'deleted'
     and pr.account_status_changed_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 30))
  union all
  select m.id, m.storage_backend, m.storage_path, null::text
    from public.post_media m
    left join public.file_posts f on m.owner_type = 'file' and f.id = m.owner_id
    left join public.experience_posts e on m.owner_type = 'experience' and e.id = m.owner_id
   where m.storage_path is not null and ((f.id is not null and (
            (f.deleted_at is not null and f.deleted_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 30)))
            or exists (select 1 from public.profiles pr where pr.id = f.author_id and pr.account_status = 'deleted'
                          and pr.account_status_changed_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 30)))))
      or (e.id is not null and (
            (e.deleted_at is not null and e.deleted_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 30)))
            or exists (select 1 from public.profiles pr where pr.id = e.author_id and pr.account_status = 'deleted'
                          and pr.account_status_changed_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 30))))));
$$;
revoke execute on function public.list_expired_storage(integer) from public, anon, authenticated;
grant execute on function public.list_expired_storage(integer) to service_role;
revoke execute on function public.list_expired_storage(integer) from public, anon, authenticated;
grant execute on function public.list_expired_storage(integer) to service_role;

-- kb_pending_count is server-only as well (locked on live already; explicit here too).
revoke execute on function public.kb_pending_count(text) from public, anon, authenticated;
grant execute on function public.kb_pending_count(text) to service_role;

-- Read-only check of the defaults afterwards: functions created by postgres in public
-- should list only service_role (and postgres) with X:
--   select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl
--    where defaclnamespace = 'public'::regnamespace and defaclobjtype = 'f';
-- Read-only check afterwards (all rows should show false / false):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can,
--        has_function_privilege('authenticated', p.oid, 'execute') as user_can
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('hub_ai_key_secrets','get_user_ai_key','purge_expired','list_expired_storage',
--                      'kb_pending_documents','kb_cleanup_models','claim_scan','consume_one_time_max',
--                      'record_view','record_download','record_hub_ai_key_check','get_upload_max_file','match_kb_chunks')
--  order by 1;
