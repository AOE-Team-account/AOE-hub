-- AOEhub database setup, part 4 of 4. Run the parts in order (1, 2, 3 ...). Each part is safe to run again.

-- ============================================================================
-- Daily upload allowance (Step 7). One default for everyone (hub_settings:
-- upload_daily_files, upload_daily_bytes) that the Creator can raise or lower
-- in the Creator panel at any time, plus an optional override for one member.
-- The Creator account itself is never limited. The day is the UTC day.
-- ============================================================================
create table if not exists public.upload_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  files integer not null default 0,
  bytes bigint not null default 0,
  primary key (user_id, day)
);
alter table public.upload_usage enable row level security;

create table if not exists public.member_upload_limits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  files_per_day integer check (files_per_day is null or files_per_day >= 0),
  bytes_per_day bigint check (bytes_per_day is null or bytes_per_day >= 0),
  updated_at timestamptz not null default now()
);
alter table public.member_upload_limits enable row level security;

insert into public.hub_settings (key, value) values
  ('upload_daily_files', '100'::jsonb),
  ('upload_daily_bytes', '1073741824'::jsonb)
on conflict (key) do nothing;

-- What this member may upload per day: their own override, else the hub default.
-- Returns nulls (= no limit) for the Creator.
create or replace function private.upload_limits(p_user uuid, out o_files bigint, out o_bytes bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ov public.member_upload_limits;
begin
  if private.has_role(p_user, 'creator') then
    o_files := null; o_bytes := null; return;
  end if;
  select * into v_ov from public.member_upload_limits where user_id = p_user;
  o_files := coalesce(v_ov.files_per_day,
    (select case when jsonb_typeof(value) = 'number' then (value)::numeric::bigint end from public.hub_settings where key = 'upload_daily_files'), 100);
  o_bytes := coalesce(v_ov.bytes_per_day,
    (select case when jsonb_typeof(value) = 'number' then (value)::numeric::bigint end from public.hub_settings where key = 'upload_daily_bytes'), 1073741824);
end;
$$;

-- Server only. Takes p_files / p_bytes from today's allowance if they fit;
-- atomic, so two uploads at once cannot overspend. Always answers with the
-- numbers the member needs for a clear message.
create or replace function public.take_upload_allowance(p_user uuid, p_files integer, p_bytes bigint)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_lf bigint;
  v_lb bigint;
  v_files integer;
  v_bytes bigint;
  v_ok boolean := false;
begin
  select o_files, o_bytes into v_lf, v_lb from private.upload_limits(p_user);
  insert into public.upload_usage (user_id, day) values (p_user, (now() at time zone 'utc')::date)
  on conflict (user_id, day) do nothing;
  update public.upload_usage
     set files = files + p_files, bytes = bytes + p_bytes
   where user_id = p_user and day = (now() at time zone 'utc')::date
     and (v_lf is null or files + p_files <= v_lf)
     and (v_lb is null or bytes + p_bytes <= v_lb)
  returning files, bytes into v_files, v_bytes;
  v_ok := v_files is not null;
  if not v_ok then
    select files, bytes into v_files, v_bytes from public.upload_usage where user_id = p_user and day = (now() at time zone 'utc')::date;
  end if;
  return jsonb_build_object(
    'ok', v_ok,
    'limit_files', v_lf, 'limit_bytes', v_lb,
    'files_left', case when v_lf is null then null else greatest(0, v_lf - v_files) end,
    'bytes_left', case when v_lb is null then null else greatest(0, v_lb - v_bytes) end);
end;
$$;

-- Server only: gives back files that did not make it into storage.
create or replace function public.refund_upload_allowance(p_user uuid, p_files integer, p_bytes bigint)
returns void
language sql
volatile
set search_path = public
as $$
  update public.upload_usage
     set files = greatest(0, files - p_files), bytes = greatest(0, bytes - p_bytes)
   where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

-- Creator panel: one member's override and today's use.
create or replace function public.member_upload_limit(p_user_id uuid)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_ov public.member_upload_limits;
  v_use public.upload_usage;
  v_lf bigint;
  v_lb bigint;
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  select * into v_ov from public.member_upload_limits where user_id = p_user_id;
  select * into v_use from public.upload_usage where user_id = p_user_id and day = (now() at time zone 'utc')::date;
  select o_files, o_bytes into v_lf, v_lb from private.upload_limits(p_user_id);
  return jsonb_build_object(
    'override_files', v_ov.files_per_day, 'override_bytes', v_ov.bytes_per_day,
    'limit_files', v_lf, 'limit_bytes', v_lb,
    'used_files', coalesce(v_use.files, 0), 'used_bytes', coalesce(v_use.bytes, 0));
end;
$$;

-- Creator panel: set (or, with both null, clear) one member's override.
create or replace function public.set_member_upload_limit(p_user_id uuid, p_files integer, p_bytes bigint)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'No such member.'; end if;
  if (p_files is not null and (p_files < 0 or p_files > 1000000)) or (p_bytes is not null and (p_bytes < 0 or p_bytes > 10000000000000)) then
    raise exception 'That limit is out of range.';
  end if;
  if p_files is null and p_bytes is null then
    delete from public.member_upload_limits where user_id = p_user_id;
  else
    insert into public.member_upload_limits (user_id, files_per_day, bytes_per_day) values (p_user_id, p_files, p_bytes)
    on conflict (user_id) do update set files_per_day = excluded.files_per_day, bytes_per_day = excluded.bytes_per_day, updated_at = now();
  end if;
  perform private.log_activity(auth.uid(), 'setting-changed', 'user', p_user_id, p_user_id, null,
                               jsonb_build_object('key', 'upload_limit', 'files', p_files, 'bytes', p_bytes));
end;
$$;

-- ============================================================================
-- Profile picture and profile look (Step 8)
-- The picture is re-saved by the server (nothing but a small picture survives)
-- and is visible to anyone who can open the profile. The look (frame,
-- background, post font) is cosmetic and open to every account.
-- ============================================================================
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists profile_frame text not null default 'none';
alter table public.profiles add column if not exists profile_background text not null default 'none';
alter table public.profiles add column if not exists post_font text not null default 'default';
alter table public.profiles drop constraint if exists profiles_profile_frame_check;
alter table public.profiles add constraint profiles_profile_frame_check check (profile_frame in ('none', 'gold', 'leaf', 'sky', 'double'));
alter table public.profiles drop constraint if exists profiles_profile_background_check;
alter table public.profiles add constraint profiles_profile_background_check check (profile_background in ('none', 'paper', 'sage', 'night'));
alter table public.profiles drop constraint if exists profiles_post_font_check;
alter table public.profiles add constraint profiles_post_font_check check (post_font in ('default', 'serif', 'rounded', 'mono'));

-- A report about someone's profile picture goes to the Creator, Watchers and Deacons.
insert into public.reviewer_permissions (role, kind, action)
select r.role, 'picture', a.action
  from (values ('creator'), ('watcher'), ('deacon')) as r(role)
  cross join (values ('view'), ('delete'), ('dismiss')) as a(action)
on conflict do nothing;

-- A reviewer, having LOOKED at the picture, removes it. The member is asked to
-- change it. Returns the stored file's name so the server can delete the file.
create or replace function public.remove_profile_picture(p_user_id uuid, p_report_id uuid)
returns text
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report public.reports;
  v_old text;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if not private.reviewer_can(v_uid, 'picture', 'delete') then raise exception 'You are not allowed to do this.'; end if;
  if p_user_id = v_uid then raise exception 'This one is yours. Another reviewer will handle it.'; end if;
  select * into v_report from public.reports where id = p_report_id and status = 'open' and target_type = 'profile-picture' and target_id = p_user_id;
  if not found then raise exception 'That report does not exist or is already settled.'; end if;

  select avatar_path into v_old from public.profiles where id = p_user_id;
  update public.profiles set avatar_path = null where id = p_user_id;
  update public.reports set status = 'resolved' where target_type = 'profile-picture' and target_id = p_user_id and status = 'open';
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id,
          'Please change your profile picture. It broke the hub''s content policy: No graphic, sexual, or adult content. We removed it, and you can choose a new one in your profile.',
          'profile-picture-removed', '{}'::jsonb);
  perform private.log_activity(v_uid, 'picture-removed', 'user', p_user_id, p_user_id, null,
                               jsonb_build_object('report_id', p_report_id));
  return v_old;
end;
$$;

alter table public.experience_posts add column if not exists made_with_ai boolean not null default false;

-- ============================================================================
-- Preview pictures and short videos (Step 7). Optional. A file post can have
-- several pictures and videos; an experience post one picture. Pictures are
-- re-encoded by the server (so nothing but a picture survives); videos go
-- through the malware check and stay hidden until it passes. Written only by
-- the server (service role); read through the policy below.
-- ============================================================================
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('file', 'experience')),
  owner_id uuid not null,
  kind text not null check (kind in ('image', 'video')),
  storage_backend text not null default 'r2' check (storage_backend in ('r2', 'internet-archive')),
  storage_path text,
  mime_type text not null,
  size_bytes bigint not null,
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'flagged')),
  scan_analysis_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists post_media_owner_idx on public.post_media (owner_type, owner_id, sort_order);
alter table public.post_media enable row level security;

drop policy if exists "clean preview media is public" on public.post_media;
create policy "clean preview media is public" on public.post_media
  for select using (
    (scan_status = 'clean' and (
        (owner_type = 'file' and exists (select 1 from public.file_posts f where f.id = owner_id and f.deleted_at is null and private.author_is_active(f.author_id)))
     or (owner_type = 'experience' and exists (select 1 from public.experience_posts e where e.id = owner_id and e.deleted_at is null and private.author_is_active(e.author_id)))))
    or (owner_type = 'file' and exists (select 1 from public.file_posts f where f.id = owner_id and f.author_id = auth.uid() and f.deleted_at is null))
    or (owner_type = 'experience' and exists (select 1 from public.experience_posts e where e.id = owner_id and e.author_id = auth.uid() and e.deleted_at is null))
    or private.reviewer_can(auth.uid(), 'file', 'view')
  );

-- When a post is erased for good, its media rows go with it (the purge job
-- removes the stored bytes first; see list_expired_storage).
create or replace function private.drop_post_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.post_media where owner_type = tg_argv[0] and owner_id = old.id;
  return old;
end;
$$;
drop trigger if exists drop_media_file on public.file_posts;
create trigger drop_media_file after delete on public.file_posts for each row execute function private.drop_post_media('file');
drop trigger if exists drop_media_experience on public.experience_posts;
create trigger drop_media_experience after delete on public.experience_posts for each row execute function private.drop_post_media('experience');

-- A member asking for another website to be allowed.
create table if not exists public.link_host_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  host text not null check (char_length(host) between 3 and 200),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'approved', 'dismissed')),
  created_at timestamptz not null default now()
);
alter table public.link_host_requests enable row level security;
drop policy if exists "members file and see their own link requests" on public.link_host_requests;
create policy "members file and see their own link requests" on public.link_host_requests
  for select using (auth.uid() = user_id or private.creator_unlocked(false));
drop policy if exists "members can ask for a link site" on public.link_host_requests;
create policy "members can ask for a link site" on public.link_host_requests
  for insert with check (auth.uid() = user_id and status = 'open' and private.can_participate(auth.uid()));

create or replace function public.add_link_host(p_host text, p_name text)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_host text := lower(btrim(coalesce(p_host, '')));
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  v_host := regexp_replace(v_host, '^https?://', '');
  v_host := regexp_replace(v_host, '/.*$', '');
  if v_host !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' or position('.' in v_host) = 0 then raise exception 'Use just the website name, like itch.io.'; end if;
  insert into public.approved_link_hosts (host, name, active) values (v_host, left(btrim(coalesce(nullif(p_name, ''), v_host)), 80), true)
  on conflict (host) do update set name = excluded.name, active = true;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'link_host_added', 'host', v_host));
end;
$$;

create or replace function public.remove_link_host(p_host text)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  delete from public.approved_link_hosts where host = lower(btrim(p_host));
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'link_host_removed', 'host', p_host));
end;
$$;

create or replace function public.resolve_link_host_request(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_req public.link_host_requests;
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  select * into v_req from public.link_host_requests where id = p_id and status = 'open';
  if not found then raise exception 'No such open request.'; end if;
  update public.link_host_requests set status = case when p_approve then 'approved' else 'dismissed' end where id = p_id;
  if p_approve then perform public.add_link_host(v_req.host, null); end if;
  insert into public.notifications (user_id, body, kind, data)
  values (v_req.user_id,
          case when p_approve then 'Your request was approved: links to ' || v_req.host || ' are now allowed.'
               else 'Your request for links to ' || v_req.host || ' was not approved this time.' end,
          'link-host-request', '{}'::jsonb);
end;
$$;

-- (Defined here, after post_media exists.)
drop function if exists public.list_expired_storage(integer);
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
       (p.deleted_at is not null and p.deleted_at < now() - make_interval(days => p_days))
       or exists (select 1 from public.profiles pr
                   where pr.id = p.author_id and pr.account_status = 'deleted'
                     and pr.account_status_changed_at < now() - make_interval(days => p_days))
     )
  union all
  select m.id, m.storage_backend, m.storage_path, null::text
    from public.post_media m
    left join public.file_posts f on m.owner_type = 'file' and f.id = m.owner_id
    left join public.experience_posts e on m.owner_type = 'experience' and e.id = m.owner_id
   where m.storage_path is not null and ((f.id is not null and (
            (f.deleted_at is not null and f.deleted_at < now() - make_interval(days => p_days))
            or exists (select 1 from public.profiles pr where pr.id = f.author_id and pr.account_status = 'deleted'
                          and pr.account_status_changed_at < now() - make_interval(days => p_days))))
      or (e.id is not null and (
            (e.deleted_at is not null and e.deleted_at < now() - make_interval(days => p_days))
            or exists (select 1 from public.profiles pr where pr.id = e.author_id and pr.account_status = 'deleted'
                          and pr.account_status_changed_at < now() - make_interval(days => p_days)))));
$$;
revoke execute on function public.list_expired_storage(integer) from public, anon, authenticated;
grant execute on function public.list_expired_storage(integer) to service_role;

-- Whether the signed-in member has turned on two-step sign-in.
create or replace function public.my_two_step_status()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'enrolled', exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified'),
    'aal2', private.is_aal2(),
    'required_for_staff', private.setting_true('require_2fa_staff'),
    'is_staff', private.is_reviewer(auth.uid())
  );
$$;

-- Creator only: send a member a private note asking them to turn on two-step
-- sign-in (so they can be made a Watcher or Deacon). Says nothing about why.
create or replace function public.ask_for_two_step(p_user_id uuid)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and account_status = 'active') then
    raise exception 'That person does not exist.';
  end if;
  if exists (select 1 from public.notifications
              where user_id = p_user_id and kind = 'two-step-request' and created_at > now() - interval '1 day') then
    raise exception 'They were already asked in the last day.';
  end if;
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id,
          'Please turn on two-step sign-in: open Settings → Two-step sign-in and scan the picture with an authenticator app (Google Authenticator, Microsoft Authenticator or Authy). It makes your account much safer.',
          'two-step-request', '{}'::jsonb);
  perform private.log_activity(auth.uid(), 'two-step-requested', 'user', p_user_id, p_user_id, null, '{}'::jsonb);
end;
$$;

-- Creator only: look a person up by name or email (nobody is ever listed
-- without a search).
drop function if exists public.find_people(text);
create or replace function public.find_people(p_query text)
returns table (id uuid, name text, display_name text, email text, account_status text, roles text[], record text, has_two_step boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  if auth.uid() is null or not private.creator_unlocked(false) then raise exception 'Only the Creator can do this.'; end if;
  if char_length(v_q) < 2 then return; end if;
  return query
    select p.id, p.name, p.display_name, u.email::text, p.account_status,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}'::text[]),
           private.record_text(p.id),
           exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.name ilike '%' || v_q || '%' or p.display_name ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%'
     order by p.name
     limit 20;
end;
$$;

-- Creator only: accounts that need a decision (suspended, reported at 5 red)
-- and accounts that were deleted and can still be restored.
create or replace function public.creator_account_queue()
returns table (user_id uuid, name text, email text, account_status text, status_reason text,
               status_changed_at timestamptz, record text, referral_id uuid, referral_at timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  return query
    select p.id, p.name, u.email::text, p.account_status, p.account_status_reason, p.account_status_changed_at,
           private.record_text(p.id), a.id, a.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.account_referrals a on a.user_id = p.id and a.status = 'open'
     where p.account_status <> 'active' or a.id is not null
     order by coalesce(a.created_at, p.account_status_changed_at) desc;
end;
$$;

-- Hub announcements: Creator only, shown as coming from AOEhub (never from a
-- person). The columns that make a post an announcement are not client-writable.
create or replace function public.post_announcement(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can post announcements.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then raise exception 'Title must be 1 to 200 characters.'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 5000 then raise exception 'Message must be 1 to 5000 characters.'; end if;
  insert into public.experience_posts (author_id, title, body, pinned, is_announcement)
  values (auth.uid(), btrim(p_title), btrim(p_body), true, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================================
-- Write protection (security hardening, 2026-10-11)
-- Found by testing against the live project: Supabase grants every API role
-- full write access to every public table and execute on every public
-- function by default, so (a) the earlier "revoke update (points, ...)" did
-- nothing — a member could set their own points; and (b) award_points() was
-- callable by anyone holding the public key. Row-level security still decided
-- WHICH rows, but not WHICH COLUMNS or which functions.
--
-- From here on: browsers (anon / authenticated) can write only the exact
-- columns listed below, and call only the functions listed below. Everything
-- else goes through SECURITY DEFINER functions or the server's service role.
-- ============================================================================

-- ---- Tables: strip all direct writes, then grant back exactly what's used --
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- Tables created later must not get open write access by default either.
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;

-- Internal tables: the API roles have no business even reading them.
revoke all on public.kb_documents, public.kb_chunks, public.post_views from anon, authenticated;
revoke all on public.warnings, public.account_referrals from anon, authenticated;
revoke all on public.kb_document_models, public.ai_provider_state from anon, authenticated;
revoke all on public.ui_languages, public.ui_strings, public.content_translations, public.translation_usage from anon, authenticated;
revoke all on public.upload_usage, public.member_upload_limits from anon, authenticated;
revoke all on public.hub_ai_keys from anon, authenticated;
revoke insert, update, delete on public.post_media from anon, authenticated;
revoke insert, update, delete, truncate on public.ai_key_help from anon, authenticated;
revoke all on public.hub_settings, public.creator_access, public.creator_sessions, public.creator_recovery_keys, public.creator_security_events from anon, authenticated;
revoke all on public.restrictions from anon;

-- profiles: only the person's own presentation fields. Points, counters,
-- account status and age attestation are changed by functions/triggers only.
grant update (name, display_name, onboarding_experience, onboarding_reason, referral_source, region, language, profile_frame, profile_background, post_font)
  on public.profiles to authenticated;

grant insert, delete on public.follows to authenticated;

-- file_posts / experience_posts: members create and delete their own; views,
-- pinned, announcement flags, deletion fields are never client-written.
grant insert (author_id, title, description, section, media_type, authorship, remix_of_post_id, made_with_ai)
  on public.file_posts to authenticated;
grant delete on public.file_posts to authenticated;

grant insert (author_id, category, title, body, made_with_ai) on public.experience_posts to authenticated;
grant insert (user_id, host, note) on public.link_host_requests to authenticated;
grant delete on public.experience_posts to authenticated;

-- file_assets: written only by the upload route (service role) and the scan
-- cron — a member must never be able to mark their own file "clean".
-- (No grants at all: reads go through the select policy.)

grant insert (parent_type, parent_id, parent_comment_id, author_id, type, body) on public.comments to authenticated;
grant delete on public.comments to authenticated;

grant insert (target_type, target_id, reason, details, reported_by) on public.reports to authenticated;

grant update (read) on public.notifications to authenticated;


-- ---- Functions: only the listed ones are callable from a browser ----------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Functions members may call (always as themselves; each checks auth.uid()).
grant execute on function public.set_my_ai_key(text, text, text) to authenticated;
grant execute on function public.remove_my_ai_key() to authenticated;
grant execute on function public.soft_delete_item(text, uuid, text) to authenticated;
grant execute on function public.dismiss_report(uuid, text) to authenticated;
grant execute on function public.undo_activity(bigint) to authenticated;
grant execute on function public.restore_item(text, uuid) to authenticated;
grant execute on function public.list_trash() to authenticated;
grant execute on function public.grant_role(uuid, text) to authenticated;
grant execute on function public.revoke_role(uuid, text) to authenticated;
grant execute on function public.accept_terms(text, text) to authenticated;
grant execute on function public.pending_terms(text) to authenticated;
grant execute on function public.post_announcement(text, text) to authenticated;
grant execute on function public.warn_user(text, uuid, text) to authenticated;
grant execute on function public.set_notice(text, uuid, text) to authenticated;
grant execute on function public.remove_notice(text, uuid) to authenticated;
grant execute on function public.suspend_account(uuid, text) to authenticated;
grant execute on function public.set_account_status(uuid, text, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.restrict_account(uuid, text) to authenticated;
grant execute on function public.report_to_creator(uuid) to authenticated;
grant execute on function public.decide_referral(uuid, text) to authenticated;
grant execute on function public.warning_summaries(uuid[]) to authenticated;
grant execute on function public.person_evidence(uuid) to authenticated;
grant execute on function public.find_people(text) to authenticated;
grant execute on function public.creator_status() to authenticated;
grant execute on function public.set_creator_code(text, text) to authenticated;
grant execute on function public.verify_creator_code(text) to authenticated;
grant execute on function public.use_recovery_key(text) to authenticated;
grant execute on function public.create_recovery_keys() to authenticated;
grant execute on function public.lock_creator_panel() to authenticated;
grant execute on function public.creator_security_events_list() to authenticated;
grant execute on function public.get_hub_settings() to authenticated;
grant execute on function public.set_hub_setting(text, jsonb) to authenticated;
grant execute on function public.member_upload_limit(uuid) to authenticated;
grant execute on function public.remove_profile_picture(uuid, uuid) to authenticated;
grant execute on function public.add_link_host(text, text) to authenticated;
grant execute on function public.remove_link_host(text) to authenticated;
grant execute on function public.resolve_link_host_request(uuid, boolean) to authenticated;
grant execute on function public.add_hub_ai_key(text, text, text) to authenticated;
grant execute on function public.set_hub_ai_key_active(uuid, boolean) to authenticated;
grant execute on function public.remove_hub_ai_key(uuid) to authenticated;
grant execute on function public.list_hub_ai_keys() to authenticated;
grant execute on function public.set_member_upload_limit(uuid, integer, bigint) to authenticated;
grant execute on function public.my_two_step_status() to authenticated;
grant execute on function public.set_ai_key_help(text, text[], text, boolean) to authenticated;
grant execute on function public.list_ai_key_help() to authenticated;
grant execute on function public.ask_for_two_step(uuid) to authenticated;
grant execute on function public.pin_my_item(text, uuid) to authenticated;
grant execute on function public.unpin_my_item(text) to authenticated;
grant execute on function public.creator_account_queue() to authenticated;
-- list_expired_storage, purge_expired: server (service role) only.
-- award_points, record_view, record_download, record_account_deletion,
-- get_user_ai_key, match_kb_chunks: server (service role) only.

