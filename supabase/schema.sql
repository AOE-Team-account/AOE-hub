-- AOEhub — Phase 2 database schema
--
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New
-- query → paste this whole file → Run) on a freshly created project.
-- It is written to be safe to re-run (IF NOT EXISTS everywhere it can be).
--
-- Design notes (see "AOEhub memory from chat.md" for the full rationale):
--  - The hub has no points system (removed 2026-10-25); only plain counters
--    (views, downloads, followers, files) are kept.
--  - The hub launches with these tables empty; there is no seed data here
--    on purpose (see the "launches empty" note in the memory doc).

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector, for the RAG AI (Phase 6)

-- ============================================================================
-- profiles — public-facing user data, 1:1 with auth.users
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  display_name text,
  member_since timestamptz not null default now(),
  followers_count integer not null default 0,
  following_count integer not null default 0,
  files_count integer not null default 0,
  onboarding_experience text check (onboarding_experience in ('homeschooling', 'in-school', 'unschooling', 'want-to-know-more', 'new-way-of-learning')),
  onboarding_reason text check (onboarding_reason in ('curriculum', 'community', 'philosophy', 'notsure')),
  referral_source text check (referral_source is null or referral_source in ('friend', 'web-search', 'social-media', 'youtube', 'other')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data. Row is created automatically on signup by handle_new_user().';

-- Onboarding Q1 widened from a homeschooling-experience scale to a broader
-- "what's your situation" question that also fits people who aren't
-- homeschooling at all (memory doc update). `alter ... add column if not
-- exists` is a no-op on a fresh install (the column above already has it);
-- this only matters for a project that ran schema.sql before this change.
alter table public.profiles add column if not exists referral_source text;
alter table public.profiles drop constraint if exists profiles_onboarding_experience_check;
alter table public.profiles add constraint profiles_onboarding_experience_check
  check (onboarding_experience in ('homeschooling', 'in-school', 'unschooling', 'want-to-know-more', 'new-way-of-learning'));
alter table public.profiles drop constraint if exists profiles_referral_source_check;
alter table public.profiles add constraint profiles_referral_source_check
  check (referral_source is null or referral_source in ('friend', 'web-search', 'social-media', 'youtube', 'other'));

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age integer;
begin
  -- The sign-up form records an age attestation and terms acceptance as
  -- metadata. Anything under 13 is ignored (nobody can attest to that).
  v_age := case when (new.raw_user_meta_data ->> 'age_attested_min') ~ '^[0-9]{1,3}$'
                then (new.raw_user_meta_data ->> 'age_attested_min')::integer end;
  if v_age is not null and v_age < 13 then v_age := null; end if;

  insert into public.profiles (id, name, age_attested_min, age_attested_at)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
          v_age, case when v_age is not null then now() end);

  if (new.raw_user_meta_data ->> 'accepted_terms') = 'true' then
    insert into public.terms_acceptances (user_id, kind, version)
    select new.id, tv.kind, tv.version
      from public.terms_versions tv
     where tv.scope = 'hub'
       and tv.published_at = (select max(t2.published_at) from public.terms_versions t2 where t2.kind = tv.kind and t2.scope = tv.scope)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Foundation for roles, moderation records and terms tracking
-- (project memory doc chat6: "Roles & moderation powers", Trust & safety,
--  and the marketplace "build-now rules"). Everything here is data-driven so
-- new roles, reasons and content kinds (e.g. a marketplace "listing") are
-- added as rows, not new if-statements.
-- ============================================================================

-- A schema the API does NOT expose. Supabase only publishes the `public`
-- schema over its REST/RPC interface, so helpers placed here can be used by
-- row-level-security policies and by other SQL functions but can never be
-- called by a browser. That matters for roles: "who is a Watcher or Deacon"
-- must stay secret (anonymity rule), and a public has_role(user, role) RPC
-- would let anyone ask it about anyone.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- ---- Roles (independent flags; one row per role a person holds) -----------

create table if not exists public.role_definitions (
  code text primary key,
  label text not null,
  description text not null,
  is_reviewer boolean not null default false,
  is_public_badge boolean not null default false,
  sort_order integer not null default 0
);

comment on table public.role_definitions is 'The kinds of role that exist. Add a row to add a role (e.g. a seller role later); roles are independent of each other.';

insert into public.role_definitions (code, label, description, is_reviewer, is_public_badge, sort_order) values
  ('creator',  'Creator',  'Total power over the hub. Does not post; uses an ordinary account for that. Invisible to everyone else.', true,  false, 1),
  ('watcher',  'Watcher',  'Sees every post, comment, file and report; can add a notice, warn, delete or dismiss. Invisible to everyone else.', true,  false, 2),
  ('deacon',   'Deacon',   'Like a Watcher, but for posts and comments only, never files. Invisible to everyone else.', true,  false, 3),
  ('answerer', 'Answerer', 'Posts, files and comments are pinned to the top. Shows the A badge.', false, true,  4),
  ('verified', 'Verified', 'The Creator agrees with their ideas. Shows the V badge; comments are highlighted.', false, true,  5)
on conflict (code) do update
  set label = excluded.label, description = excluded.description, is_reviewer = excluded.is_reviewer,
      is_public_badge = excluded.is_public_badge, sort_order = excluded.sort_order;

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null references public.role_definitions (code),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index if not exists user_roles_role_idx on public.user_roles (role);

-- Role checks used by policies and functions. SECURITY DEFINER so they can
-- read user_roles regardless of who is asking; living in `private` keeps them
-- off the public API.
create or replace function private.has_role(p_user_id uuid, p_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = p_user_id and role = p_role);
$$;

create or replace function private.is_reviewer(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles r join public.role_definitions d on d.code = r.role
     where r.user_id = p_user_id and d.is_reviewer
  );
$$;


-- The highest reviewer tier a person holds, for the activity log.
create or replace function private.top_reviewer_role(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select r.role from public.user_roles r
   where r.user_id = p_user_id and r.role in ('creator', 'watcher', 'deacon')
   order by case r.role when 'creator' then 1 when 'watcher' then 2 else 3 end
   limit 1;
$$;

-- ---- Moderation reasons and reviewer permissions (data, not if-statements) --

-- One fixed list. `level` is what a warning with this reason counts as
-- (green/yellow/red) — the reviewer never picks the level. `applies_to` says
-- which actions the reason can be used for. `section` lets the marketplace
-- have its own list later (e.g. "paywalled" is a reason on the free boards
-- only). Rows marked "assumed" were not spelled out in the memory doc.
create table if not exists public.moderation_reasons (
  code text primary key,
  label text not null,
  level text check (level in ('green', 'yellow', 'red')),
  applies_to text[] not null default '{delete,warn}',
  section text not null default 'boards',
  sort_order integer not null default 0,
  active boolean not null default true,
  note text
);

insert into public.moderation_reasons (code, label, level, applies_to, sort_order, note) values
  ('scam',             'Scam or asking for money',                          'red',    '{delete,warn,suspend}', 10, null),
  ('harmful',          'Harmful content (as defined in the Terms and Conditions)', 'red',    '{delete,warn,suspend}', 20, null),
  ('inappropriate',    'Inappropriate content',                             'red',    '{delete,warn,suspend}', 30, 'Level assumed (memory doc chat6).'),
  ('child-safety',     'Child-safety concern',                              'red',    '{delete,warn,suspend}', 35, 'Added at Clara''s request 2026-10-11 (emergency suspension).'),
  ('wrong-ideas',      'Breaks a rule in the Terms and Conditions',               'yellow', '{delete,warn}', 40, 'Renamed 2026-10-31: the Terms and Conditions do not allow removal for "wrong ideas".'),
  ('ads',              'Ads or self-promotion',                             'yellow', '{delete,warn}', 50, null),
  ('paywalled',        'Paywalled or costs money',                          'yellow', '{delete,warn}', 60, 'Level assumed (memory doc chat6).'),
  ('copyright',        'Copyright — not their work',                        'yellow', '{delete,warn}', 70, 'Level assumed (memory doc chat6).'),
  ('off-topic',        'Off-topic / not education related',                 'green',  '{delete,warn}', 80, null),
  ('other',            'Something else that worries me (please explain)',   null,     '{delete}',      90, 'Delete only: a warning needs a reason that sets a level.'),
  ('no-violation',     'No rule was broken',                                null,     '{dismiss}',    110, 'DRAFT dismissal reason — Clara to edit.'),
  ('already-handled',  'Already handled',                                   null,     '{dismiss}',    120, 'DRAFT dismissal reason — Clara to edit.'),
  ('mistaken-report',  'The report was a mistake',                          null,     '{dismiss}',    130, 'DRAFT dismissal reason — Clara to edit.')
on conflict (code) do update
  set label = excluded.label, level = excluded.level, applies_to = excluded.applies_to,
      sort_order = excluded.sort_order, note = excluded.note;

-- What each reviewer role may do to each kind of content. `kind` is the kind
-- of the thing (file, post, comment, user), not the board it sits on.
create table if not exists public.reviewer_permissions (
  role text not null references public.role_definitions (code),
  kind text not null,
  action text not null check (action in ('view', 'notice', 'warn', 'delete', 'dismiss', 'suspend')),
  primary key (role, kind, action)
);

insert into public.reviewer_permissions (role, kind, action)
select r.role, k.kind, a.action
  from (values ('creator'), ('watcher')) as r(role)
  cross join (values ('file'), ('post'), ('comment')) as k(kind)
  cross join (values ('view'), ('notice'), ('warn'), ('delete'), ('dismiss')) as a(action)
on conflict do nothing;

insert into public.reviewer_permissions (role, kind, action)
select 'deacon', k.kind, a.action
  from (values ('post'), ('comment')) as k(kind)
  cross join (values ('view'), ('notice'), ('warn'), ('delete'), ('dismiss')) as a(action)
on conflict do nothing;

-- Reports about accounts go to the Creator only (the memory doc only gives
-- Watchers and Deacons post/comment/file reports).
insert into public.reviewer_permissions (role, kind, action) values
  ('creator', 'user', 'view'), ('creator', 'user', 'dismiss')
on conflict do nothing;

-- (private.reviewer_can is defined below, with the Creator-unlock and two-step checks.)

-- Report target types and content kinds are spelled differently.
create or replace function private.report_kind(p_target_type text)
returns text
language sql
immutable
as $$
  select case p_target_type when 'experience-post' then 'post' when 'profile-picture' then 'picture' else p_target_type end;
$$;

-- Who wrote a file post / experience post / comment (null for anything else).
create or replace function private.item_author(p_kind text, p_id uuid)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  -- plpgsql (not sql) so this can be created before the content tables exist.
  return case p_kind
    when 'file'    then (select author_id from public.file_posts where id = p_id)
    when 'post'    then (select author_id from public.experience_posts where id = p_id)
    when 'comment' then (select author_id from public.comments where id = p_id)
    when 'user'    then p_id
    when 'picture' then p_id
  end;
end;
$$;

grant execute on function private.has_role(uuid, text) to anon, authenticated, service_role;
grant execute on function private.is_reviewer(uuid) to anon, authenticated, service_role;
grant execute on function private.report_kind(text) to anon, authenticated, service_role;
grant execute on function private.item_author(text, uuid) to anon, authenticated, service_role;
grant execute on function private.top_reviewer_role(uuid) to service_role;

-- ---- Activity log (append-only; only the Creator can read it) --------------

-- One row per reviewer action: what, when, who. Generic on purpose (an event
-- type plus details) so order/payout events can use it later. Nothing
-- references profiles, so the record survives an account being deleted.
-- Undoing something never edits a row: it appends a new row whose `undoes`
-- points at the original.
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null,
  target_kind text,
  target_id uuid,
  subject_user_id uuid,
  reason_code text,
  details jsonb not null default '{}'::jsonb,
  undoes bigint references public.activity_log (id)
);

create unique index if not exists activity_log_undoes_key on public.activity_log (undoes) where undoes is not null;
create index if not exists activity_log_target_idx on public.activity_log (target_kind, target_id, id);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_subject_idx on public.activity_log (subject_user_id);

create or replace function private.activity_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
  -- Only the 30-day purge of an erased account (public.purge_expired) may remove rows.
  if tg_op = 'DELETE' and current_setting('app.purge_ok', true) = 'on' then return old; end if;
  raise exception 'The activity log is append-only.';
end;
$$;

drop trigger if exists activity_log_no_change on public.activity_log;
create trigger activity_log_no_change before update or delete on public.activity_log
  for each row execute function private.activity_log_is_append_only();

drop trigger if exists activity_log_no_truncate on public.activity_log;
create trigger activity_log_no_truncate before truncate on public.activity_log
  for each statement execute function private.activity_log_is_append_only();

-- The only way a row gets in. Not granted to anyone: it is called from inside
-- the SECURITY DEFINER functions below.
create or replace function private.log_activity(
  p_actor uuid,
  p_action text,
  p_target_kind text,
  p_target_id uuid,
  p_subject uuid,
  p_reason text,
  p_details jsonb,
  p_undoes bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.activity_log (actor_id, actor_role, action, target_kind, target_id, subject_user_id, reason_code, details, undoes)
  values (p_actor, private.top_reviewer_role(p_actor), p_action, p_target_kind, p_target_id, p_subject, p_reason, coalesce(p_details, '{}'::jsonb), p_undoes)
  returning id into v_id;
  return v_id;
end;
$$;

alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

drop policy if exists "only the Creator reads the activity log" on public.activity_log;
create policy "only the Creator reads the activity log" on public.activity_log
  for select using (private.has_role(auth.uid(), 'creator'));

-- ---- Terms, policies and age attestation ------------------------------------

-- Which version of each document exists. `scope` says what accepting it
-- unlocks: 'hub' for the whole site, 'marketplace' later for buying/selling
-- only, so a new version can gate one feature without locking everyone out.
create table if not exists public.terms_versions (
  kind text not null check (kind in ('terms', 'content-policy', 'safety-policy', 'privacy', 'community', 'copyright')),
  version text not null,
  scope text not null default 'hub' check (scope in ('hub', 'marketplace')),
  published_at timestamptz not null default now(),
  summary text,
  primary key (kind, version)
);

insert into public.terms_versions (kind, version, scope, summary) values
  ('terms',         'draft-1', 'hub', 'Placeholder until the final Terms of Service text is approved.'),
  ('content-policy','draft-1', 'hub', 'Placeholder until the final content policy text is approved.'),
  ('safety-policy', 'draft-1', 'hub', 'Placeholder until the final safety policy text is approved.'),
  ('privacy',       'draft-1', 'hub', 'Placeholder until the final Privacy Policy text is approved.'),
  ('community',     'draft-1', 'hub', 'Placeholder until the final Community Policy text is approved.'),
  ('copyright',     'draft-1', 'hub', 'Placeholder until the final Copyright and Takedown Policy text is approved.')
on conflict (kind, version) do nothing;

create table if not exists public.terms_acceptances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, kind, version),
  foreign key (kind, version) references public.terms_versions (kind, version)
);

-- Age attestation is its own explicit field (13+ now) so an 18+ confirmation
-- can be added later for selling.
alter table public.profiles add column if not exists age_attested_min integer check (age_attested_min is null or age_attested_min >= 13);
alter table public.profiles add column if not exists age_attested_at timestamptz;

-- Where the member says they are using the hub from (their own statement, not
-- checked): only decides which free-AI-key instructions are shown. Required at
-- sign-up, changeable in Settings. It is personal information (Privacy Policy).
alter table public.profiles add column if not exists region text check (region is null or region in ('china', 'world'));

-- The member's chosen interface language (so it follows them to a new device).
alter table public.profiles add column if not exists language text check (language is null or language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

alter table public.terms_versions enable row level security;
alter table public.terms_acceptances enable row level security;
revoke all on public.terms_versions, public.terms_acceptances from anon, authenticated;
grant select on public.terms_versions to anon, authenticated;
grant select on public.terms_acceptances to authenticated;

drop policy if exists "terms versions are public" on public.terms_versions;
create policy "terms versions are public" on public.terms_versions for select using (true);

drop policy if exists "people see their own acceptances" on public.terms_acceptances;
create policy "people see their own acceptances" on public.terms_acceptances
  for select using (auth.uid() = user_id);

alter table public.role_definitions enable row level security;
alter table public.user_roles enable row level security;
alter table public.moderation_reasons enable row level security;
alter table public.reviewer_permissions enable row level security;
revoke all on public.role_definitions, public.user_roles, public.moderation_reasons, public.reviewer_permissions from anon, authenticated;
grant select on public.role_definitions, public.user_roles, public.moderation_reasons to anon, authenticated;
grant select on public.reviewer_permissions to authenticated;

drop policy if exists "role definitions are public" on public.role_definitions;
create policy "role definitions are public" on public.role_definitions for select using (true);

-- Anonymity rule: only the A and V badges are ever visible. Everyone can see
-- who holds a public-badge role; anything else is visible to the person
-- themselves and to the Creator alone.
drop policy if exists "roles are visible only as badges, to oneself, or to the Creator" on public.user_roles;
create policy "roles are visible only as badges, to oneself, or to the Creator" on public.user_roles
  for select using (
    auth.uid() = user_id
    or private.has_role(auth.uid(), 'creator')
    or exists (select 1 from public.role_definitions d where d.code = role and d.is_public_badge)
  );

drop policy if exists "moderation reasons are readable" on public.moderation_reasons;
create policy "moderation reasons are readable" on public.moderation_reasons for select using (true);

drop policy if exists "reviewers read the permission table" on public.reviewer_permissions;
create policy "reviewers read the permission table" on public.reviewer_permissions
  for select using (private.is_reviewer(auth.uid()));

-- ---- Account standing, warnings, restrictions, notices (chat6 "Warnings") ---

-- active: normal. suspended: emergency suspension pending the Creator's review.
-- deleted: disabled and hidden; erased for good after 30 days (purge_expired).
alter table public.profiles add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'suspended', 'deleted'));
alter table public.profiles add column if not exists account_status_reason text;
alter table public.profiles add column if not exists account_status_by uuid;
alter table public.profiles add column if not exists account_status_changed_at timestamptz;

-- "Suspend" is a reviewer action too (Watchers and the Creator; not Deacons).
alter table public.reviewer_permissions drop constraint if exists reviewer_permissions_action_check;
alter table public.reviewer_permissions add constraint reviewer_permissions_action_check
  check (action in ('view', 'notice', 'warn', 'delete', 'dismiss', 'suspend'));
insert into public.reviewer_permissions (role, kind, action) values
  ('creator', 'user', 'suspend'), ('watcher', 'user', 'suspend')
on conflict do nothing;

-- One row per warning. No foreign key to profiles: the record, like the
-- activity log, must outlive the account. Only "undone" may ever change.
create table if not exists public.warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_kind text not null check (item_kind in ('file', 'post', 'comment')),
  item_id uuid,
  reason_code text not null references public.moderation_reasons (code),
  level text not null check (level in ('green', 'yellow', 'red')),
  issued_by uuid,
  issued_role text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid
);

create index if not exists warnings_user_idx on public.warnings (user_id) where undone_at is null;
create index if not exists warnings_user_all_idx on public.warnings (user_id, created_at);

create or replace function private.warnings_are_evidence()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.purge_ok', true) = 'on' then return old; end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'Warnings are evidence and cannot be deleted.';
  end if;
  if old.undone_at is not null
     or new.undone_at is null
     or (to_jsonb(new) - 'undone_at' - 'undone_by') <> (to_jsonb(old) - 'undone_at' - 'undone_by') then
    raise exception 'A warning can only be marked as undone.';
  end if;
  return new;
end;
$$;

drop trigger if exists warnings_protect on public.warnings;
create trigger warnings_protect before update or delete on public.warnings
  for each row execute function private.warnings_are_evidence();
drop trigger if exists warnings_no_truncate on public.warnings;
create trigger warnings_no_truncate before truncate on public.warnings
  for each statement execute function private.warnings_are_evidence();

-- A one-week restriction: cannot post, upload or comment; can still read and
-- download. Applies once when the red count crosses 3.
create table if not exists public.restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  caused_by_warning uuid,
  set_by uuid,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  lifted_at timestamptz,
  lifted_reason text
);

create index if not exists restrictions_user_idx on public.restrictions (user_id, ends_at);

-- Watchers and Deacons may report an account to the Creator at 5 red.
create table if not exists public.account_referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  reported_by uuid not null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'deleted', 'dismissed')),
  decided_by uuid,
  decided_at timestamptz
);

create unique index if not exists account_referrals_one_open on public.account_referrals (user_id) where status = 'open';

-- The current notice on a post, file or comment. Names the tier, never the
-- person (anonymity rule); who set it and what it replaced live in the
-- activity log, which only the Creator reads.
create table if not exists public.item_notices (
  item_kind text not null check (item_kind in ('file', 'post', 'comment')),
  item_id uuid not null,
  body text not null check (char_length(body) between 1 and 500),
  tier text not null check (tier in ('watcher', 'deacon', 'creator')),
  set_at timestamptz not null default now(),
  primary key (item_kind, item_id)
);

alter table public.warnings enable row level security;
alter table public.restrictions enable row level security;
alter table public.account_referrals enable row level security;
alter table public.item_notices enable row level security;

drop policy if exists "people see their own restrictions" on public.restrictions;
create policy "people see their own restrictions" on public.restrictions
  for select using (auth.uid() = user_id);

drop policy if exists "notices are public" on public.item_notices;
create policy "notices are public" on public.item_notices for select using (true);

-- "From verified voices": a Verified member may pin ONE post and, separately,
-- ONE file of their own. Self-chosen, never algorithmic, never touches search.
-- A notice or a warning on the pinned item clears the pin for good; clearing
-- the notice or restoring the role does not bring it back.
create table if not exists public.verified_pins (
  user_id uuid not null references public.profiles (id) on delete cascade,
  board text not null check (board in ('file', 'post')),
  item_id uuid not null,
  pinned_at timestamptz not null default now(),
  primary key (user_id, board)
);

alter table public.verified_pins enable row level security;
drop policy if exists "verified pins are public" on public.verified_pins;
create policy "verified pins are public" on public.verified_pins for select using (true);

create or replace function private.clear_pins_for_item(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind in ('file', 'post') then
    delete from public.verified_pins where board = p_kind and item_id = p_id;
  end if;
end;
$$;

-- Standing helpers. plpgsql where they touch tables created further down.
create or replace function private.warning_counts(p_user uuid)
returns table (green_raw integer, yellow_raw integer, red_raw integer, green integer, yellow integer, red integer)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  g integer;
  y integer;
  r integer;
  ey integer;
begin
  select count(*) filter (where level = 'green'),
         count(*) filter (where level = 'yellow'),
         count(*) filter (where level = 'red')
    into g, y, r
    from public.warnings
   where user_id = p_user and undone_at is null;
  -- 10 green = 1 yellow; 5 yellow (including those) = 1 red. History is never
  -- rewritten: only the displayed count converts.
  ey := y + g / 10;
  return query select g, y, r, g % 10, ey % 5, r + ey / 5;
end;
$$;

create or replace function private.record_text(p_user uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select format('%s red · %s yellow · %s green', c.red, c.yellow, c.green) from private.warning_counts(p_user) c;
$$;

create or replace function private.is_restricted(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.restrictions
     where user_id = p_user and lifted_at is null and ends_at > now()
  );
$$;

create or replace function private.author_is_active(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select account_status = 'active' from public.profiles where id = p_user), false);
$$;

-- May this account post, upload or comment right now? Decided by account
-- standing, never by role lists. The Creator never posts: the Creator uses an
-- ordinary account for that (memory doc: Creator role).
create or replace function private.can_participate(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_user is not null
     and private.author_is_active(p_user)
     and not private.is_restricted(p_user)
     and not private.has_role(p_user, 'creator');
$$;

create or replace function private.notify_creators(p_body text, p_kind text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, body, kind, data)
  select user_id, p_body, p_kind, coalesce(p_data, '{}'::jsonb) from public.user_roles where role = 'creator';
end;
$$;

-- The AI must never quote content from a suspended or deleted account.
create or replace function private.drop_kb_for_author(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents
   where (source_type = 'file-post' and source_id in (select id from public.file_posts where author_id = p_user))
      or (source_type = 'experience-post' and source_id in (select id from public.experience_posts where author_id = p_user))
      or (source_type = 'community-answer' and source_id in (select id from public.comments where author_id = p_user));
end;
$$;

grant execute on function private.warning_counts(uuid) to authenticated, service_role;
grant execute on function private.record_text(uuid) to authenticated, service_role;
grant execute on function private.is_restricted(uuid) to anon, authenticated, service_role;
grant execute on function private.author_is_active(uuid) to anon, authenticated, service_role;
grant execute on function private.can_participate(uuid) to anon, authenticated, service_role;

-- ============================================================================
-- Creator access (chat6: "Access to the Creator panel", "If the Creator is
-- locked out", "Staff-account protection"). The Creator role alone is not
-- enough to use Creator powers: the session must also have passed two-step
-- sign-in (authenticator app) AND the access code, and must not have been idle
-- for more than 30 minutes. Everything is checked here, in the database, on
-- every Creator action — hiding a button is never the protection.
-- ============================================================================

create table if not exists public.hub_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Watchers and Deacons need two-step sign-in (recommended in the memory doc).
-- The Creator can switch this off from the Hub tab.
insert into public.hub_settings (key, value) values ('require_2fa_staff', 'true'::jsonb)
on conflict (key) do nothing;

-- The access code, hashed like a password. One row, only for the Creator.
create table if not exists public.creator_access (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code_hash text not null,
  updated_at timestamptz not null default now()
);

-- A Creator session that has passed the second step. Keyed by the sign-in
-- session id inside the login token, so a new login must pass it again.
create table if not exists public.creator_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  via text not null check (via in ('code', 'recovery')),
  verified_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create table if not exists public.creator_recovery_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists creator_recovery_keys_user_idx on public.creator_recovery_keys (user_id) where used_at is null;

create table if not exists public.creator_security_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid not null,
  kind text not null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists creator_security_events_idx on public.creator_security_events (user_id, kind, at desc);

alter table public.hub_settings enable row level security;
alter table public.creator_access enable row level security;
alter table public.creator_sessions enable row level security;
alter table public.creator_recovery_keys enable row level security;
alter table public.creator_security_events enable row level security;
-- No client policies on any of these: they are reached only through the
-- functions below.

create or replace function private.session_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

create or replace function private.is_aal2()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function private.setting_true(p_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select (value)::text = 'true' from public.hub_settings where key = p_key), false);
$$;

-- Is this request a fully unlocked Creator session? Role + (two-step or a
-- recovery-key session) + a live, non-idle session row. With p_touch the
-- idle clock is restarted; policies pass false.
create or replace function private.creator_unlocked(p_touch boolean default false)
returns boolean
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := private.session_id();
  v_via text;
begin
  if v_uid is null or v_sid is null then return false; end if;
  if not private.has_role(v_uid, 'creator') then return false; end if;
  select via into v_via from public.creator_sessions
   where session_id = v_sid and user_id = v_uid and last_used_at > now() - interval '30 minutes';
  if not found then return false; end if;
  -- A code session also needs the second authentication step on this login.
  if v_via = 'code' and not private.is_aal2() then return false; end if;
  if p_touch then
    update public.creator_sessions set last_used_at = now() where session_id = v_sid;
  end if;
  return true;
end;
$$;

-- Reviewer permission check, now with the extra protections: the Creator
-- must be unlocked, and Watchers/Deacons must have passed two-step sign-in
-- (when the hub setting is on).
create or replace function private.reviewer_can(p_user_id uuid, p_kind text, p_action text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  for v_role in
    select r.role
      from public.user_roles r
      join public.reviewer_permissions p on p.role = r.role
     where r.user_id = p_user_id and p.kind = p_kind and p.action = p_action
  loop
    if v_role = 'creator' then
      if p_user_id = auth.uid() and private.creator_unlocked(false) then return true; end if;
    elsif private.setting_true('require_2fa_staff') then
      if p_user_id = auth.uid() and private.is_aal2() then return true; end if;
    else
      return true;
    end if;
  end loop;
  return false;
end;
$$;

grant execute on function private.session_id() to anon, authenticated, service_role;
grant execute on function private.is_aal2() to anon, authenticated, service_role;
grant execute on function private.setting_true(text) to anon, authenticated, service_role;
grant execute on function private.creator_unlocked(boolean) to anon, authenticated, service_role;
grant execute on function private.reviewer_can(uuid, text, text) to anon, authenticated, service_role;

-- (There is no "admin" role: only Creator, Watcher, Deacon, Answerer and Verified.)
drop function if exists public.am_i_admin();

-- The Creator sees everyone's roles only from an unlocked session.
drop policy if exists "roles are visible only as badges, to oneself, or to the Creator" on public.user_roles;
create policy "roles are visible only as badges, to oneself, or to the Creator" on public.user_roles
  for select using (
    auth.uid() = user_id
    or private.creator_unlocked(false)
    or exists (select 1 from public.role_definitions d where d.code = role and d.is_public_badge)
  );

drop policy if exists "only the Creator reads the activity log" on public.activity_log;
create policy "only the Creator reads the activity log" on public.activity_log
  for select using (private.creator_unlocked(false));




-- ============================================================================
-- follows
-- ============================================================================

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- ============================================================================
-- File Board
-- ============================================================================

create table if not exists public.file_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  section text not null check (section in ('curriculum', 'games', 'books', 'cards', 'songs', 'art', 'printables', 'apps')),
  media_type text not null check (media_type in ('document', 'image', 'audio', 'video', 'game', 'app')),
  authorship text not null check (authorship in ('original', 'remix', 'notmine')),
  remix_of_post_id uuid references public.file_posts (id) on delete set null,
  views integer not null default 0,
  changelog jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists file_posts_author_id_idx on public.file_posts (author_id);
create index if not exists file_posts_section_idx on public.file_posts (section);
create index if not exists file_posts_created_at_idx on public.file_posts (created_at desc);

create table if not exists public.file_assets (
  id uuid primary key default gen_random_uuid(),
  file_post_id uuid not null references public.file_posts (id) on delete cascade,
  label text not null,
  storage_path text,          -- set once Phase 3 wires up R2 / Internet Archive
  mime_type text,
  downloads integer not null default 0,
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'flagged')),
  created_at timestamptz not null default now()
);

-- Added in the Phase 3 pass: which of the two storage backends holds this
-- asset (see src/lib/storage/router.ts for the size-based routing logic),
-- and its size for display + for that same routing decision on any future
-- re-upload. `alter table ... add column if not exists` so this stays safe
-- to re-run even on a project that already has file_assets from Phase 2.
alter table public.file_assets add column if not exists storage_backend text check (storage_backend in ('r2', 'internet-archive'));
alter table public.file_assets add column if not exists size_bytes bigint;
-- VirusTotal's analysis id for a still-"pending" scan, so a later check
-- (see the /api/cron/check-pending-scans route) can poll for the result
-- without needing the original file bytes again. Cleared once resolved.
alter table public.file_assets add column if not exists scan_analysis_id text;

create index if not exists file_assets_file_post_id_idx on public.file_assets (file_post_id);

-- ============================================================================
-- Step 7: "Made with AI" label, "Other" choices, and link-outs
-- ============================================================================
alter table public.file_posts add column if not exists made_with_ai boolean not null default false;

-- "Other" for a section or media type that none of the choices fit.
alter table public.file_posts drop constraint if exists file_posts_section_check;
alter table public.file_posts add constraint file_posts_section_check
  check (section in ('curriculum', 'games', 'books', 'cards', 'songs', 'art', 'printables', 'apps', 'other'));
alter table public.file_posts drop constraint if exists file_posts_media_type_check;
alter table public.file_posts add constraint file_posts_media_type_check
  check (media_type in ('document', 'image', 'audio', 'video', 'game', 'app', 'other'));

-- A link-out: the "file" is a link to another website (for files too big to
-- upload, or hosted elsewhere). Nothing is stored or scanned by the hub, so
-- the row has no storage_path and cannot be downloaded through the hub;
-- scan_status is 'clean' only so that the row is visible (the page labels it
-- "Hosted outside AOEhub").
alter table public.file_assets add column if not exists is_link boolean not null default false;
alter table public.file_assets add column if not exists link_url text;
alter table public.file_assets add column if not exists link_host text;

-- A hosted game: the uploaded .zip was unpacked into storage under game_prefix and is
-- played from the hub's separate play address (only once scan_status is 'clean').
alter table public.file_assets add column if not exists is_game boolean not null default false;
alter table public.file_assets add column if not exists game_prefix text;

-- The websites a link-out may point to. Editable by the Creator.
create table if not exists public.approved_link_hosts (
  host text primary key check (host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'),
  name text not null check (char_length(name) between 1 and 80),
  active boolean not null default true,
  added_at timestamptz not null default now()
);
alter table public.approved_link_hosts enable row level security;
drop policy if exists "approved link hosts are public" on public.approved_link_hosts;
create policy "approved link hosts are public" on public.approved_link_hosts for select using (active);

insert into public.approved_link_hosts (host, name) values
  ('github.com', 'GitHub'),
  ('github.io', 'GitHub Pages'),
  ('itch.io', 'itch.io'),
  ('store.steampowered.com', 'Steam'),
  ('play.unity.com', 'Unity Play')
on conflict (host) do nothing;



comment on column public.file_assets.scan_status is 'Virus scan gate (ClamAV scanner) — only "clean" assets are ever downloadable.';
comment on column public.file_assets.storage_backend is 'Which S3-compatible backend actually holds the bytes: Cloudflare R2 (small files) or Internet Archive (large files).';

-- ============================================================================
-- Experience Board
-- ============================================================================

create table if not exists public.experience_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  category text check (category in ('philosophy', 'starting-out', 'milestones', 'struggles', 'curriculum-reviews', 'reflections', 'just-sharing')),
  title text,
  body text not null,
  views integer not null default 0,
  pinned boolean not null default false,
  is_announcement boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists experience_posts_author_id_idx on public.experience_posts (author_id);
create index if not exists experience_posts_created_at_idx on public.experience_posts (created_at desc);

comment on column public.experience_posts.is_announcement is 'Creator-only pinned announcements — enforced by the announcement_author_must_be_creator trigger below.';

create or replace function public.announcement_author_must_be_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_announcement and not private.has_role(new.author_id, 'creator') then
    raise exception 'Only the Creator may post announcements';
  end if;
  return new;
end;
$$;

drop trigger if exists experience_posts_announcement_check on public.experience_posts;
create trigger experience_posts_announcement_check
  before insert or update on public.experience_posts
  for each row execute function public.announcement_author_must_be_creator();
drop function if exists public.announcement_author_must_be_admin();

-- ============================================================================
-- Comments — shared by File Board and Experience Board
-- ============================================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('file', 'experience-post')),
  parent_id uuid not null,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('question', 'suggestion', 'sharing')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_parent_idx on public.comments (parent_type, parent_id);

-- ============================================================================
-- Reports
-- ============================================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('file', 'experience-post', 'comment', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('scam', 'off-topic', 'inappropriate', 'paywalled', 'copyright', 'other')),
  details text,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'dismissed', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status);

-- ----------------------------------------------------------------------------
-- Trash (soft delete). A reviewer's deletion hides an item instead of
-- removing the row, so the Creator can restore it exactly as it was. The
-- public read policies below hide anything with deleted_at set; the Creator
-- reads the trash through list_trash(). (A member deleting their own post
-- still removes it for good, as before.)
-- ----------------------------------------------------------------------------
alter table public.file_posts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists deleted_reason text;
alter table public.experience_posts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists deleted_reason text;
alter table public.comments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists deleted_reason text;

create index if not exists file_posts_deleted_idx on public.file_posts (deleted_at) where deleted_at is not null;
create index if not exists experience_posts_deleted_idx on public.experience_posts (deleted_at) where deleted_at is not null;
create index if not exists comments_deleted_idx on public.comments (deleted_at) where deleted_at is not null;


-- ----------------------------------------------------------------------------
-- Groups were removed entirely (project memory doc chat5, 2026-10-08).
-- Older databases still have the groups tables, so this removes them. Every
-- statement is a no-op once the objects are gone, so re-running is safe.
-- (is_group_member() and group_member_count() are dropped further down,
-- after the comment policies that used to call them have been rewritten.)
-- ----------------------------------------------------------------------------
delete from public.comments where parent_type = 'group';
alter table public.comments drop constraint if exists comments_parent_type_check;
alter table public.comments add constraint comments_parent_type_check
  check (parent_type in ('file', 'experience-post'));

delete from public.reports where target_type = 'group';
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('file', 'experience-post', 'comment', 'user', 'profile-picture'));

drop trigger if exists reports_sync_group_flag on public.reports;
drop function if exists public.sync_group_reported_flag();
drop table if exists public.group_invites;
drop table if exists public.group_members;
drop table if exists public.groups;
drop function if exists public.creator_must_be_eligible_for_group();
drop function if exists public.add_creator_as_group_member();
alter table public.profiles drop column if exists groups_count;

-- (The old admin_notify_user() was replaced by warn_user() and notices.)
drop function if exists public.admin_notify_user(uuid, text);

-- ============================================================================
-- View and download counters (there are no points; these are plain counts)
-- ============================================================================

-- Dedup table for "one counted view per person per day": a row here means that
-- viewer already counted for that content today.
create table if not exists public.post_views (
  target_type text not null,
  target_id uuid not null,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_on date not null default current_date,
  primary key (target_type, target_id, viewer_id, viewed_on)
);

-- Call this from the app whenever a signed-in user opens a file or
-- experience post. Silently no-ops on a duplicate same-day view.
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

-- Call this from the app when a signed-in user downloads a file asset.
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

-- Points were removed from the hub (2026-10-25). On a database that still has
-- them, take them away: the earning triggers, the functions, the ledger and
-- the balance column. Nothing here runs on a fresh install.
drop trigger if exists comments_award_points on public.comments;
drop trigger if exists file_posts_award_remix_points on public.file_posts;
drop function if exists public.award_points_for_comment();
drop function if exists public.award_points_for_remix();
drop function if exists public.award_points(uuid, integer, text, text, uuid);
drop table if exists public.points_events cascade;
alter table public.profiles drop column if exists points;

-- ============================================================================
-- Notifications
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  kind text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id, read);

-- Generic notification payload (event type is `kind`; details go here), so
-- order, payout and report events can use the same table later.
alter table public.notifications add column if not exists data jsonb not null default '{}'::jsonb;

-- ============================================================================
-- RAG knowledge base (Phase 6 uses these; created now since pgvector needs
-- to be enabled anyway, and the shape is settled)
-- ============================================================================

create table if not exists public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('philosophy-text', 'community-answer', 'file-post', 'experience-post', 'hub-guide')),
  source_id uuid,
  title text,
  content text not null,
  created_at timestamptz not null default now()
);

-- 768 dimensions: the hub's fixed embedding size (Phase 5). Chosen because
-- it's the native size of common local models (nomic-embed-text) AND a size
-- the big commercial embedders can be asked to produce, so the embedding
-- model can be swapped without altering this column. Each chunk records
-- which model made it (embedding_model) — vectors from different models are
-- not comparable, so a model swap means re-indexing, never mixing.
create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(768),
  embedding_model text,
  created_at timestamptz not null default now()
);

-- Existing projects created this table at 1536 dimensions in Phase 2 (it has
-- never held data). Bring it to 768 idempotently; a no-op once it matches.
do $$
begin
  if (select atttypmod from pg_attribute
        where attrelid = 'public.kb_chunks'::regclass and attname = 'embedding') <> 768 then
    drop index if exists public.kb_chunks_embedding_idx;
    delete from public.kb_chunks;
    alter table public.kb_chunks alter column embedding type vector(768);
  end if;
end $$;

alter table public.kb_chunks add column if not exists embedding_model text;

-- HNSW rather than IVFFlat: IVFFlat picks its clusters from the rows present
-- when the index is built, so building it on an empty table gives poor
-- recall forever. HNSW has no such training step.
drop index if exists public.kb_chunks_embedding_idx;
create index if not exists kb_chunks_embedding_hnsw_idx on public.kb_chunks
  using hnsw (embedding vector_cosine_ops);
create index if not exists kb_chunks_document_id_idx on public.kb_chunks (document_id);

-- Phase 5 additions to kb_documents: a hash of the indexed text (so unchanged
-- posts are never re-embedded), and a 'hub-guide' source type for the built-in
-- "how the hub works" text.
alter table public.kb_documents add column if not exists content_hash text;
alter table public.kb_documents drop constraint if exists kb_documents_source_type_check;
update public.kb_documents set source_type = source_type where false;
delete from public.kb_documents where source_type = 'admin-answer';
alter table public.kb_documents add constraint kb_documents_source_type_check
  check (source_type in ('philosophy-text', 'community-answer', 'file-post', 'experience-post', 'hub-guide'));
create unique index if not exists kb_documents_source_uniq
  on public.kb_documents (source_type, source_id) where source_id is not null;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.file_posts enable row level security;
alter table public.file_assets enable row level security;
alter table public.experience_posts enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.post_views enable row level security;
alter table public.notifications enable row level security;
alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;

-- profiles: readable by everyone (public profile pages); only the owner
-- can update their own row (counters are function/trigger
-- managed, not client-writable — see the column grants below).
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable" on public.profiles
  for select using (account_status = 'active' or auth.uid() = id or private.is_reviewer(auth.uid()));

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke update (followers_count, following_count, files_count, member_since)
  on public.profiles from authenticated;

-- follows: readable by everyone; only the follower can create/delete their
-- own follow rows.
drop policy if exists "follows are publicly readable" on public.follows;
create policy "follows are publicly readable" on public.follows for select using (true);

drop policy if exists "users manage their own follows" on public.follows;
create policy "users manage their own follows" on public.follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- File Board: browsing is always free (even logged-out/anon), per the
-- access model. Writes require auth; only the author may
-- update/delete their own posts.
drop policy if exists "file posts are publicly readable" on public.file_posts;
create policy "file posts are publicly readable" on public.file_posts
  for select using (deleted_at is null and private.author_is_active(author_id));

-- Reviewers also see content of suspended accounts (hidden from everyone
-- else); the trash stays Creator-only through list_trash().
drop policy if exists "reviewers see hidden members' files" on public.file_posts;
create policy "reviewers see hidden members' files" on public.file_posts
  for select using (deleted_at is null and private.reviewer_can(auth.uid(), 'file', 'view'));

drop policy if exists "signed-in users can post files" on public.file_posts;
create policy "signed-in users can post files" on public.file_posts
  for insert with check (auth.uid() = author_id and private.can_participate(auth.uid()));

-- Reviewers never edit or hard-delete members' posts directly: they act
-- through soft_delete_item() (trash, reason, log), so only authors appear here.
drop policy if exists "authors and admins can update file posts" on public.file_posts;
drop policy if exists "authors can update file posts" on public.file_posts;
create policy "authors can update file posts" on public.file_posts
  for update using (auth.uid() = author_id);

drop policy if exists "authors and admins can delete file posts" on public.file_posts;
drop policy if exists "authors can delete file posts" on public.file_posts;
create policy "authors can delete file posts" on public.file_posts
  for delete using (auth.uid() = author_id);

-- Per project memory: "flagged files get quarantined automatically, never
-- shown publicly." Only clean assets are visible to everyone; the
-- uploader can still see their own pending/flagged assets (so they get
-- feedback on what happened), and reviewers can see everything for moderation.
drop policy if exists "clean file assets are publicly readable" on public.file_assets;
create policy "clean file assets are publicly readable" on public.file_assets
  for select using (
    (scan_status = 'clean'
       and exists (select 1 from public.file_posts where id = file_post_id and deleted_at is null))
    or exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid() and deleted_at is null)
    or private.reviewer_can(auth.uid(), 'file', 'view')
  );

drop policy if exists "post authors manage their file assets" on public.file_assets;
create policy "post authors manage their file assets" on public.file_assets
  for all using (
    exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid())
  ) with check (
    exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid())
    and private.can_participate(auth.uid())
  );

-- Experience Board: same public-read / authed-write shape. The
-- announcement_author_must_be_creator trigger (above) is the real guard on
-- is_announcement; this policy just gates writes to signed-in users.
drop policy if exists "experience posts are publicly readable" on public.experience_posts;
create policy "experience posts are publicly readable" on public.experience_posts
  for select using (deleted_at is null and private.author_is_active(author_id));

drop policy if exists "reviewers see hidden members' posts" on public.experience_posts;
create policy "reviewers see hidden members' posts" on public.experience_posts
  for select using (deleted_at is null and private.reviewer_can(auth.uid(), 'post', 'view'));

drop policy if exists "signed-in users can post experiences" on public.experience_posts;
create policy "signed-in users can post experiences" on public.experience_posts
  for insert with check (auth.uid() = author_id and private.can_participate(auth.uid()));

drop policy if exists "authors and admins can update experience posts" on public.experience_posts;
drop policy if exists "authors can update experience posts" on public.experience_posts;
create policy "authors can update experience posts" on public.experience_posts
  for update using (auth.uid() = author_id);

drop policy if exists "authors and admins can delete experience posts" on public.experience_posts;
drop policy if exists "authors can delete experience posts" on public.experience_posts;
create policy "authors can delete experience posts" on public.experience_posts
  for delete using (auth.uid() = author_id);

-- Comments: everything on the hub is public (Groups, the only private space,
-- was removed), so comments on files and posts are readable by everyone.
drop policy if exists "comments are readable per parent visibility" on public.comments;
drop policy if exists "comments are publicly readable" on public.comments;
create policy "comments are publicly readable" on public.comments
  for select using (deleted_at is null and private.author_is_active(author_id));

drop policy if exists "reviewers see hidden members' comments" on public.comments;
create policy "reviewers see hidden members' comments" on public.comments
  for select using (deleted_at is null and private.reviewer_can(auth.uid(), 'comment', 'view'));

drop policy if exists "signed-in users can comment" on public.comments;
create policy "signed-in users can comment" on public.comments
  for insert with check (
    auth.uid() = author_id
    and parent_type in ('file', 'experience-post')
    and private.can_participate(auth.uid())
  );

drop policy if exists "authors and admins can delete comments" on public.comments;
drop policy if exists "authors can delete comments" on public.comments;
create policy "authors can delete comments" on public.comments
  for delete using (auth.uid() = author_id);

-- Nothing calls these any more (the comment policies above were the last
-- users), so they can finally go. Must stay below those policies.
drop function if exists public.is_group_member(uuid, uuid);
drop function if exists public.group_member_count(uuid);

-- Reports: anyone signed in can file one; reviewers read them per the
-- permission table (see below).
drop policy if exists "signed-in users can file reports" on public.reports;
create policy "signed-in users can file reports" on public.reports
  for insert with check (auth.uid() = reported_by);

-- Who sees which reports comes from the permission table: Watchers and the
-- Creator see post, comment and file reports; Deacons post and comment
-- reports; account reports go to the Creator. Settling a report goes through
-- dismiss_report() / soft_delete_item(), so there is no update policy.
drop policy if exists "admins manage reports" on public.reports;
drop policy if exists "reviewers read reports in their scope" on public.reports;
create policy "reviewers read reports in their scope" on public.reports
  for select using (private.reviewer_can(auth.uid(), private.report_kind(target_type), 'view'));

drop policy if exists "admins update reports" on public.reports;

-- post_views: written only via record_view() (SECURITY DEFINER). No
-- client-facing policies needed at all.

-- notifications: strictly private to the recipient.
drop policy if exists "users see their own notifications" on public.notifications;
create policy "users see their own notifications" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "users can mark their notifications read" on public.notifications;
create policy "users can mark their notifications read" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- kb_documents / kb_chunks: no client policies at all — the RAG pipeline
-- (Phase 6) reads/writes these with the service role key from a trusted
-- server context only, never from the browser.

-- ============================================================================
-- Phase 5 — RAG AI
-- ============================================================================

-- Vault: Supabase's built-in encrypted secret storage. Member-supplied AI
-- API keys live here, never in a plain column (see set_my_ai_key below).
create extension if not exists supabase_vault;

-- ---- Keep the knowledge base in step with the boards ----------------------

-- When a post is deleted (by its author, a reviewer, or a cascade from a
-- banned/deleted account) its knowledge-base copy must disappear with it, so
-- the AI can never quote content that has been removed. kb_documents has no
-- client policies, hence SECURITY DEFINER.
create or replace function public.remove_kb_document_for_deleted_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents
   where source_id = old.id
     and source_type = case tg_table_name when 'file_posts' then 'file-post' else 'experience-post' end;
  return old;
end;
$$;

drop trigger if exists file_posts_remove_kb on public.file_posts;
create trigger file_posts_remove_kb after delete on public.file_posts
  for each row execute function public.remove_kb_document_for_deleted_post();

drop trigger if exists experience_posts_remove_kb on public.experience_posts;
create trigger experience_posts_remove_kb after delete on public.experience_posts
  for each row execute function public.remove_kb_document_for_deleted_post();

-- ---- Similarity search -----------------------------------------------------

-- Only chunks made by the CURRENT embedding model are searchable (vectors
-- from different models aren't comparable). Callable by the server with the
-- service role only — the chat route is the sole caller.
create or replace function public.match_kb_chunks(
  query_embedding vector(768),
  match_count integer,
  p_model text
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_type text,
  source_id uuid,
  title text,
  content text,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select c.id, c.document_id, d.source_type, d.source_id, d.title, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  where c.embedding_model = p_model and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke execute on function public.match_kb_chunks(vector, integer, text) from public, anon, authenticated;
grant execute on function public.match_kb_chunks(vector, integer, text) to service_role;

-- ---- Free-AI-key help (editable data; the steps change often) --------------
-- One row per service we point members to, per region. The Creator edits the
-- text in the Hub tab; nothing here is hard-coded in the app. Seeded once
-- ("do nothing" on conflict), so re-running this file never undoes an edit.
-- Steps for Alibaba, Zhipu and SiliconFlow follow their own documentation as
-- read on 2026-10-16; Google's and Groq's come from Google's general key
-- instructions and third-party guides and must be re-checked before launch.
create table if not exists public.ai_key_help (
  provider_id text primary key,
  region text not null check (region in ('china', 'world')),
  title text not null,
  steps text[] not null default '{}',
  note text,
  link_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.ai_key_help (provider_id, region, title, steps, note, link_url, sort_order) values
  ('qwen-cn', 'china', 'Qwen (Alibaba Cloud Model Studio, mainland China)',
   array['Open Alibaba Cloud Model Studio (also called Bailian) and sign up or log in.',
         'Turn on Model Studio and agree to its terms. New accounts may get a free starting amount; check the console.',
         'Open the API Key page, choose your region in the top-right corner, and press Create API Key. A key only works in the region it was made in: if you chose mainland China pick "Qwen (mainland China)" here, if you chose the international region pick "Qwen (international)".',
         'Copy the key straight away (it cannot be shown again) and paste it in the box here.'],
   'The free starting amount lasts a limited time. When it runs out the service asks you to verify your identity and add funds before it continues.',
   'https://bailian.console.aliyun.com/', 10),
  ('qwen-intl', 'china', 'Qwen (Alibaba Cloud Model Studio, international / Singapore)',
   array['Open Alibaba Cloud (alibabacloud.com), press Sign Up at the top right (or Log In), register with your email and follow the verification steps, then sign in.',
         'Open your Account Information page and fill in what it asks for.',
         'Open Alibaba Cloud Model Studio and, in the top-right corner, make sure the region says Singapore. Do not choose Beijing or Virginia: the free quota only applies to Singapore.',
         'If a service agreement appears, read it, tick the box and accept it. Your free quota is added automatically; you do not need to buy or claim anything.',
         'Open the API Key page and press Create API Key. Choose Default Workspace, type a description such as "My Qwen key", set Permissions to All, and press OK.',
         'Press Copy in the success window and save the key somewhere private before you close it: it cannot be shown in full again. It looks like sk-ws-… (the window also shows an API Host address; the hub already knows the right one).',
         'Before you use the key, open Free Quota settings, stay on the Free Quota tab, press "Free Quota Only Batch Operation", choose Batch Enable, press "Enable for All Models" and confirm. This makes the models stop answering when the free quota runs out instead of charging you. It can take a little while to apply.',
         'Back here, pick "Qwen (international)" and paste the key in the box.'],
   'Written from Clara''s instructions (2026-10-17). Turn on "Free Quota Only" before using the key, otherwise usage after the free quota can be charged. Pick "Qwen (international)" here, because this key was made in the Singapore region.',
   'https://modelstudio.console.alibabacloud.com/ap-southeast-1', 11),
  ('zhipu', 'china', 'Zhipu GLM (bigmodel.cn)',
   array['Open open.bigmodel.cn and press register / log in.',
         'After logging in, open your personal center and the API Keys page.',
         'Create a new API key.',
         'Copy it and paste it in the box here.'],
   'Check Zhipu''s model page for which models are free and what the limits are; they change.',
   'https://open.bigmodel.cn/', 20),
  ('siliconflow', 'china', 'SiliconFlow',
   array['Open SiliconFlow and sign in with your phone number or email.',
         'In the console open the API keys page and press the new-key button.',
         'Copy the key and paste it in the box here.'],
   'Check SiliconFlow''s model list for which models are free and whether new accounts get credit.',
   'https://cloud.siliconflow.cn/', 30),
  ('google', 'world', 'Google AI Studio',
   array['Search "aistudio.google.com", open Google AI Studio and sign in with the Google account you want to use.',
         'On the left side, near the bottom just above your profile, there are four small buttons. Press the fourth one, the one with a key picture. It opens the API keys area.',
         'If you are signed in, a key may already have been made for you. Press "Copy API key" and paste it in the box here.',
         'Or make your own: press "Create API key" at the top right, give it a name, choose a project, press create, then copy it and paste it in the box here.'],
   'Written from Clara''s own walk-through on a Mac with Chrome (2026-10-17); other browsers may look a little different. Google AI Studio is not available in some places, including mainland China. The free plan has daily limits, and Google may use what you send it on the free plan, so avoid sharing private details.',
   'https://aistudio.google.com/apikey', 10),
  ('groq', 'world', 'Groq (GroqCloud)',
   array['Search "console.groq.com" (or "groq free api key" and open "API keys - GroqCloud") and sign in with your email.',
         'At the top right you will see your profile, Settings, Docs, Dashboard, API keys and Playground. Press "API keys".',
         'Press "Create API key" at the top right and give it a name. You can also set when it expires: never, or any date that suits you.',
         'A short Cloudflare check runs, then the create button appears. Press it, and the key is shown.',
         'Copy the key straight away and save it somewhere: it is shown only once. Paste it in the box here.'],
   'Written from Clara''s own walk-through on a Mac with Chrome (2026-10-17). The free plan has daily limits, so heavy use can run out.',
   'https://console.groq.com/keys', 20)
on conflict (provider_id) do nothing;

alter table public.ai_key_help enable row level security;
drop policy if exists "key help is public" on public.ai_key_help;
create policy "key help is public" on public.ai_key_help for select using (active);

-- Creator only: edit one entry (steps, note, on/off).
create or replace function public.set_ai_key_help(p_provider_id text, p_steps text[], p_note text, p_active boolean)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if p_steps is null or array_length(p_steps, 1) is null or array_length(p_steps, 1) > 12 then raise exception 'Give between 1 and 12 steps.'; end if;
  update public.ai_key_help
     set steps = p_steps, note = nullif(btrim(coalesce(p_note, '')), ''), active = coalesce(p_active, active), updated_at = now()
   where provider_id = p_provider_id;
  if not found then raise exception 'Unknown service.'; end if;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'ai_key_help:' || p_provider_id));
end;
$$;

-- Creator only: read every entry including switched-off ones.
create or replace function public.list_ai_key_help()
returns setof public.ai_key_help
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(false) then raise exception 'Unlock the Creator panel first.'; end if;
  return query select * from public.ai_key_help order by region, sort_order;
end;
$$;

-- ---- Which embedding model has indexed which document -----------------------
-- A model name, not a single flag, so two models can be maintained side by
-- side while the library is re-embedded ("re-embed, verify, cut over, clean
-- up" — never an instant swap). Chunks carry the model that made them;
-- the live model is chosen in hub_settings (embedding_model_live) and only
-- chunks from it are searched. A document with a row here for a model has
-- EVERY chunk embedded for that model.
create table if not exists public.kb_document_models (
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  model text not null,
  completed_at timestamptz not null default now(),
  primary key (document_id, model)
);
alter table public.kb_document_models enable row level security;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kb_documents' and column_name = 'indexed_model') then
    execute 'insert into public.kb_document_models (document_id, model) select id, indexed_model from public.kb_documents where indexed_model is not null on conflict do nothing';
    execute 'alter table public.kb_documents drop column indexed_model';
  end if;
end $$;

create or replace function public.kb_pending_documents(p_model text, p_limit integer default 1)
returns table (id uuid, title text, content text)
language sql
security definer
stable
set search_path = public
as $$
  select d.id, d.title, d.content
    from public.kb_documents d
   where not exists (select 1 from public.kb_document_models m where m.document_id = d.id and m.model = p_model)
   order by d.created_at, d.id
   limit greatest(p_limit, 1);
$$;

create or replace function public.kb_pending_count(p_model text)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.kb_documents d
   where not exists (select 1 from public.kb_document_models m where m.document_id = d.id and m.model = p_model);
$$;

-- Deletes the AI's data made by any model NOT in the keep list (the "clean
-- up" step, run only after a cut-over has been checked). Returns chunks removed.
create or replace function public.kb_cleanup_models(p_keep text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  delete from public.kb_chunks where embedding_model is null or embedding_model <> all (p_keep);
  get diagnostics v_n = row_count;
  delete from public.kb_document_models where model <> all (p_keep);
  return v_n;
end;
$$;

-- Which of the hub's AI providers is resting after hitting a limit, so the
-- answer/translation AI can fall back (Gemini first, then Groq) and return.
create table if not exists public.ai_provider_state (
  provider text primary key,
  rested_until timestamptz,
  strikes integer not null default 0,
  last_error text,
  last_ok_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_state enable row level security;

-- ============================================================================
-- Translation (Step 6a). Three written languages (English, Simplified and
-- Traditional Chinese) live in the app's files. Every other language is added
-- by AI and kept here; posts, comments and notices are translated on demand
-- and remembered so the same text is never translated twice.
-- All of these are reached only by the server (service role).
-- ============================================================================

create table if not exists public.ui_languages (
  code text primary key check (code ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  english_name text not null,
  native_name text not null,
  status text not null default 'building' check (status in ('building', 'ready', 'failed')),
  done_keys integer not null default 0,
  total_keys integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.ui_languages enable row level security;

create table if not exists public.ui_strings (
  lang text not null references public.ui_languages (code) on delete cascade,
  key text not null,
  value text not null,
  primary key (lang, key)
);
alter table public.ui_strings enable row level security;

-- One row per translated field of a post, comment, notice or notification.
-- source_hash changes when the author edits the text, which makes the row
-- stale. translated is NULL when the text is already in the target language.
create table if not exists public.content_translations (
  item_type text not null check (item_type in ('experience-post', 'file', 'comment', 'notice', 'notification')),
  item_id text not null,
  field text not null,
  target_lang text not null,
  source_hash text not null,
  source_lang text,
  translated text,
  method text not null check (method in ('opencc', 'ai', 'same')),
  created_at timestamptz not null default now(),
  primary key (item_type, item_id, field, target_lang)
);
alter table public.content_translations enable row level security;

-- Daily counters behind the translation caps. kind: 'content' (posts etc.),
-- 'ui' (interface strings of a new language), 'language' (languages added).
create table if not exists public.translation_usage (
  day date not null,
  kind text not null,
  used integer not null default 0,
  primary key (day, kind)
);
alter table public.translation_usage enable row level security;

-- Takes p_n units from today's allowance for p_kind. Returns false (and takes
-- nothing) if that would go over p_cap. Atomic, so parallel requests cannot
-- jointly overspend.
create or replace function public.take_translation_budget(p_kind text, p_n integer, p_cap integer)
returns boolean
language plpgsql
volatile
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into public.translation_usage (day, kind, used) values (current_date, p_kind, 0)
  on conflict (day, kind) do nothing;
  update public.translation_usage set used = used + p_n
   where day = current_date and kind = p_kind and used + p_n <= p_cap
  returning used into v_used;
  return v_used is not null;
end;
$$;

-- Gives back unused units (a request that failed after taking them).
create or replace function public.refund_translation_budget(p_kind text, p_n integer)
returns void
language sql
volatile
set search_path = public
as $$
  update public.translation_usage set used = greatest(0, used - p_n) where day = current_date and kind = p_kind;
$$;

-- A translation is deleted together with the text it translates (promised in
-- the Terms and Privacy Policy). Notices are keyed "<kind>:<item id>".
create or replace function private.drop_translations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if tg_argv[0] = 'notice' then
    v_id := old.item_kind || ':' || old.item_id::text;
  else
    v_id := old.id::text;
  end if;
  delete from public.content_translations where item_type = tg_argv[0] and item_id = v_id;
  return old;
end;
$$;

drop trigger if exists drop_translations_experience on public.experience_posts;
create trigger drop_translations_experience after delete on public.experience_posts
  for each row execute function private.drop_translations('experience-post');
drop trigger if exists drop_translations_file on public.file_posts;
create trigger drop_translations_file after delete on public.file_posts
  for each row execute function private.drop_translations('file');
drop trigger if exists drop_translations_comment on public.comments;
create trigger drop_translations_comment after delete on public.comments
  for each row execute function private.drop_translations('comment');
drop trigger if exists drop_translations_notification on public.notifications;
create trigger drop_translations_notification after delete on public.notifications
  for each row execute function private.drop_translations('notification');
drop trigger if exists drop_translations_notice on public.item_notices;
create trigger drop_translations_notice after delete on public.item_notices
  for each row execute function private.drop_translations('notice');

insert into public.hub_settings (key, value) values
  ('translation_daily_cap', '2000'::jsonb),
  ('new_language_daily_cap', '3'::jsonb),
  ('max_ai_languages', '30'::jsonb)
on conflict (key) do nothing;

-- ---- Questions: "I don't know" posts a question to the Experience Board ----
-- (Replaces the admin inbox, chat5/6.) A question is an ordinary Experience
-- Board post in the "question" category. Current Verified members and
-- Answerers are told a question needs an answer; the asker is told about
-- every comment. Only answers from a current Answerer or Verified member
-- feed the AI (see the indexer), and they leave the AI's data the moment they
-- are deleted, hidden or no longer eligible.

-- The old admin inbox and everything that served it.
do $$
begin
  -- Only when the old table is still there (a database from before this
  -- change). Written with EXECUTE so nothing here names the table until it is
  -- known to exist; dropping the table also drops its triggers and policies.
  if to_regclass('public.admin_questions') is not null then
    execute 'drop table public.admin_questions cascade';
  end if;
end $$;
drop function if exists public.limit_open_admin_questions();
drop function if exists public.remove_kb_document_for_deleted_question();
drop function if exists public.retract_admin_answer(uuid);
drop function if exists public.answer_admin_question(uuid, text);
delete from public.kb_documents where source_type = 'admin-answer';

alter table public.experience_posts drop constraint if exists experience_posts_category_check;
alter table public.experience_posts add constraint experience_posts_category_check
  check (category in ('philosophy', 'starting-out', 'milestones', 'struggles', 'curriculum-reviews', 'reflections', 'just-sharing', 'question'));

create or replace function private.limit_daily_questions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.experience_posts
       where author_id = new.author_id and category = 'question' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can post up to 5 questions a day. Please try again tomorrow.';
  end if;
  return new;
end;
$$;

drop trigger if exists experience_posts_question_limit on public.experience_posts;
create trigger experience_posts_question_limit before insert on public.experience_posts
  for each row when (new.category = 'question') execute function private.limit_daily_questions();

create or replace function private.notify_question_asked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, body, kind, data)
  select distinct r.user_id,
         'A question needs an answer: "' || left(coalesce(nullif(new.title, ''), new.body), 120) || '"',
         'question-asked', jsonb_build_object('post_id', new.id)
    from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.account_status = 'active'
   where r.role in ('answerer', 'verified') and r.user_id <> new.author_id;
  return new;
end;
$$;

drop trigger if exists experience_posts_question_notify on public.experience_posts;
create trigger experience_posts_question_notify after insert on public.experience_posts
  for each row when (new.category = 'question') execute function private.notify_question_asked();

create or replace function private.notify_question_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asker uuid;
  v_category text;
begin
  -- A reply to a comment is part of a conversation, not a new answer.
  if new.parent_comment_id is not null then return new; end if;
  if new.parent_type <> 'experience-post' then return new; end if;
  select author_id, category into v_asker, v_category from public.experience_posts where id = new.parent_id;
  if v_category = 'question' and v_asker is not null and v_asker <> new.author_id then
    insert into public.notifications (user_id, body, kind, data)
    values (v_asker, 'Someone answered your question.', 'question-answered',
            jsonb_build_object('post_id', new.parent_id, 'comment_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists comments_question_answered on public.comments;
create trigger comments_question_answered after insert on public.comments
  for each row execute function private.notify_question_answered();

-- ---- Replies to comments ----
-- A reply is a comment whose parent_comment_id points at another comment. One
-- level only: the parent must be a top-level comment on the SAME post or file,
-- and not deleted. Who may reply is decided by the same insert policy as for
-- comments (signed in, active, not restricted), so a member who cannot comment
-- cannot reply either.
create or replace function private.check_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if new.parent_comment_id is null then return new; end if;
  select parent_type, parent_id, parent_comment_id, deleted_at, type into p
    from public.comments where id = new.parent_comment_id;
  if not found or p.deleted_at is not null
     or p.parent_type <> new.parent_type or p.parent_id <> new.parent_id
     or p.parent_comment_id is not null then
    raise exception 'You can only reply to a comment on this post.';
  end if;
  new.type := p.type;
  return new;
end;
$$;

drop trigger if exists comments_check_reply on public.comments;
create trigger comments_check_reply before insert on public.comments
  for each row execute function private.check_comment_reply();

-- The writer of a comment is told when someone replies to it.
create or replace function private.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.parent_comment_id is null then return new; end if;
  select author_id into v_owner from public.comments where id = new.parent_comment_id;
  if v_owner is not null and v_owner <> new.author_id and private.author_is_active(v_owner) then
    insert into public.notifications (user_id, body, kind, data)
    values (v_owner, 'Someone replied to your comment.', 'comment-reply',
            jsonb_build_object('post_type', new.parent_type, 'post_id', new.parent_id, 'comment_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists comments_reply_notify on public.comments;
create trigger comments_reply_notify after insert on public.comments
  for each row execute function private.notify_comment_reply();

-- The AI must never quote a community answer that has been deleted, hidden or
-- is no longer eligible. These remove its copy straight away; the indexer
-- also rebuilds the set from the current state on every run.
create or replace function private.drop_kb_for_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents where source_type = 'community-answer' and source_id = p_comment_id;
end;
$$;

create or replace function private.drop_kb_answers_by(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents
   where source_type = 'community-answer'
     and source_id in (select id from public.comments where author_id = p_user);
end;
$$;

create or replace function private.drop_kb_answers_on_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents
   where source_type = 'community-answer'
     and source_id in (select id from public.comments where parent_type = 'experience-post' and parent_id = p_post_id);
end;
$$;

create or replace function private.comment_deleted_remove_kb()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.drop_kb_for_comment(old.id);
  return old;
end;
$$;

-- Comments point at their post by id only (no foreign key, because a comment
-- can sit on either board), so deleting a post must remove its comments
-- itself — which also fires the trigger above for each answer.
create or replace function private.delete_comments_of_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.comments
   where parent_id = old.id
     and parent_type = case tg_table_name when 'file_posts' then 'file' else 'experience-post' end;
  return old;
end;
$$;

drop trigger if exists experience_posts_delete_comments on public.experience_posts;
create trigger experience_posts_delete_comments after delete on public.experience_posts
  for each row execute function private.delete_comments_of_post();
drop trigger if exists file_posts_delete_comments on public.file_posts;
create trigger file_posts_delete_comments after delete on public.file_posts
  for each row execute function private.delete_comments_of_post();

drop trigger if exists comments_remove_kb on public.comments;
create trigger comments_remove_kb after delete on public.comments
  for each row execute function private.comment_deleted_remove_kb();

-- ---- Bring-your-own AI key -------------------------------------------------

-- The key itself is in Vault; this table only remembers which provider/model
-- and which Vault secret. The browser can read its own row (never the key).
create table if not exists public.user_ai_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('google', 'anthropic', 'openai', 'groq', 'qwen-cn', 'qwen-intl', 'zhipu', 'siliconflow')),
  model text not null check (char_length(model) between 1 and 100),
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.user_ai_settings drop constraint if exists user_ai_settings_provider_check;
alter table public.user_ai_settings add constraint user_ai_settings_provider_check
  check (provider in ('google', 'anthropic', 'openai', 'groq', 'qwen-cn', 'qwen-intl', 'zhipu', 'siliconflow'));

alter table public.user_ai_settings enable row level security;

drop policy if exists "members read their own ai settings" on public.user_ai_settings;
create policy "members read their own ai settings" on public.user_ai_settings
  for select using (auth.uid() = user_id);

-- Whenever a settings row goes away (member removes their key, or their
-- account is deleted and the row cascades) the encrypted secret goes too.
create or replace function public.delete_vault_secret_for_ai_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;

drop trigger if exists user_ai_settings_delete_secret on public.user_ai_settings;
create trigger user_ai_settings_delete_secret after delete on public.user_ai_settings
  for each row execute function public.delete_vault_secret_for_ai_settings();

create or replace function public.set_my_ai_key(p_provider text, p_model text, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_secret uuid;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if p_provider not in ('google', 'anthropic', 'openai', 'groq', 'qwen-cn', 'qwen-intl', 'zhipu', 'siliconflow') then raise exception 'Unsupported provider.'; end if;
  if p_model is null or p_model !~ '^[A-Za-z0-9._:/-]{1,100}$' then raise exception 'Invalid model name.'; end if;
  if p_key is null or char_length(p_key) not between 8 and 512 then raise exception 'Invalid key.'; end if;

  select vault_secret_id into v_existing from public.user_ai_settings where user_id = v_uid;
  if v_existing is not null then
    perform vault.update_secret(v_existing, p_key, 'user_ai_key_' || v_uid::text, 'AOEhub member AI key');
    v_secret := v_existing;
  else
    v_secret := vault.create_secret(p_key, 'user_ai_key_' || v_uid::text, 'AOEhub member AI key');
  end if;

  insert into public.user_ai_settings (user_id, provider, model, vault_secret_id)
  values (v_uid, p_provider, p_model, v_secret)
  on conflict (user_id) do update
    set provider = excluded.provider, model = excluded.model,
        vault_secret_id = excluded.vault_secret_id, updated_at = now();
end;
$$;

create or replace function public.remove_my_ai_key()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_ai_settings where user_id = auth.uid();
$$;

-- Server-only: hands the decrypted key to the chat route for one request.
-- Not callable by browsers under any role except the service role.
create or replace function public.get_user_ai_key(p_user_id uuid)
returns table (provider text, model text, api_key text)
language sql
security definer
stable
set search_path = public
as $$
  select s.provider, s.model, v.decrypted_secret
  from public.user_ai_settings s
  join vault.decrypted_secrets v on v.id = s.vault_secret_id
  where s.user_id = p_user_id;
$$;

revoke execute on function public.set_my_ai_key(text, text, text) from public, anon;
grant execute on function public.set_my_ai_key(text, text, text) to authenticated;
revoke execute on function public.remove_my_ai_key() from public, anon;
grant execute on function public.remove_my_ai_key() to authenticated;
revoke execute on function public.get_user_ai_key(uuid) from public, anon, authenticated;
grant execute on function public.get_user_ai_key(uuid) to service_role;

-- ============================================================================
-- The hub's own AI key pool (Step 7). The Creator adds keys for the hub's
-- answer, translation and search AI in the Creator panel; they are stored
-- encrypted in Supabase Vault, exactly like members' own keys, and can never
-- be shown again — only a label and the last four characters. Keys in the
-- server's settings file keep working alongside these.
-- ============================================================================
create table if not exists public.hub_ai_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google', 'groq', 'qwen-intl', 'qwen-cn')),
  label text not null check (char_length(label) between 1 and 60),
  hint text not null,
  key_hash text not null unique,
  vault_secret_id uuid not null,
  active boolean not null default true,
  sort_order integer generated always as identity,
  created_at timestamptz not null default now(),
  created_by uuid,
  last_check_at timestamptz,
  last_check_ok boolean,
  last_check_note text
);
alter table public.hub_ai_keys enable row level security;

create or replace function public.delete_vault_secret_for_hub_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;

drop trigger if exists hub_ai_keys_delete_secret on public.hub_ai_keys;
create trigger hub_ai_keys_delete_secret after delete on public.hub_ai_keys
  for each row execute function public.delete_vault_secret_for_hub_key();

create or replace function public.add_hub_ai_key(p_provider text, p_label text, p_key text)
returns uuid
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
  v_secret uuid;
  v_hash text;
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if p_provider not in ('google', 'groq', 'qwen-intl', 'qwen-cn') then raise exception 'Unsupported service.'; end if;
  if p_label is null or char_length(btrim(p_label)) not between 1 and 60 then raise exception 'Give the key a short name (up to 60 characters).'; end if;
  if p_key is null or char_length(p_key) not between 8 and 512 or p_key !~ '^[A-Za-z0-9._~+/=-]+$' then raise exception 'That does not look like an API key.'; end if;
  v_hash := encode(digest(p_key, 'sha256'), 'hex');
  if exists (select 1 from public.hub_ai_keys where key_hash = v_hash) then raise exception 'That key is already in the pool.'; end if;
  v_secret := vault.create_secret(p_key, 'hub_ai_key_' || v_id::text, 'AOEhub hub AI key');
  insert into public.hub_ai_keys (id, provider, label, hint, key_hash, vault_secret_id, created_by)
  values (v_id, p_provider, btrim(p_label), right(p_key, 4), v_hash, v_secret, auth.uid());
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'hub_ai_key_added', 'provider', p_provider, 'label', btrim(p_label)));
  return v_id;
end;
$$;

create or replace function public.set_hub_ai_key_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  update public.hub_ai_keys set active = coalesce(p_active, active) where id = p_id;
  if not found then raise exception 'No such key.'; end if;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'hub_ai_key_active', 'id', p_id, 'active', p_active));
end;
$$;

create or replace function public.remove_hub_ai_key(p_id uuid)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  delete from public.hub_ai_keys where id = p_id;
  if not found then raise exception 'No such key.'; end if;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'hub_ai_key_removed', 'id', p_id));
end;
$$;

-- Creator panel list: never includes the key itself.
create or replace function public.list_hub_ai_keys()
returns table (id uuid, provider text, label text, hint text, active boolean, created_at timestamptz,
               last_check_at timestamptz, last_check_ok boolean, last_check_note text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(false) then raise exception 'Unlock the Creator panel first.'; end if;
  return query
    select k.id, k.provider, k.label, k.hint, k.active, k.created_at, k.last_check_at, k.last_check_ok, k.last_check_note
      from public.hub_ai_keys k order by k.sort_order;
end;
$$;

-- Server only (service role): the decrypted keys the AI code uses, active ones
-- first in the order they were added; and the result of a test.
create or replace function public.hub_ai_key_secrets(p_only_active boolean default true)
returns table (id uuid, provider text, label text, api_key text)
language sql
security definer
stable
set search_path = public
as $$
  select k.id, k.provider, k.label, v.decrypted_secret
    from public.hub_ai_keys k
    join vault.decrypted_secrets v on v.id = k.vault_secret_id
   where (not p_only_active or k.active)
   order by k.sort_order;
$$;

create or replace function public.record_hub_ai_key_check(p_id uuid, p_ok boolean, p_note text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.hub_ai_keys set last_check_at = now(), last_check_ok = p_ok, last_check_note = left(p_note, 200) where id = p_id;
$$;

-- ============================================================================
-- Moderation actions (chat6: Roles & moderation powers; Trust & safety)
-- Every one of these checks the caller's role on the server, every time,
-- writes the activity log, and tells the affected person privately. None of
-- them announces anything publicly.
-- ============================================================================

-- Delete (to the trash) a file post, experience post or comment.
create or replace function public.soft_delete_item(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_row jsonb;
  v_reason public.moderation_reasons;
  v_reports uuid[];
  v_report_type text;
  v_label text;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('file', 'post', 'comment') then raise exception 'Unknown kind of item.'; end if;
  if not private.reviewer_can(v_uid, p_kind, 'delete') then
    raise exception 'You are not allowed to delete this kind of item.';
  end if;

  select * into v_reason from public.moderation_reasons
   where code = p_reason and active and 'delete' = any (applies_to);
  if not found then raise exception 'Pick a reason from the list.'; end if;

  if p_kind = 'file' then
    select author_id, to_jsonb(t) into v_author, v_row from public.file_posts t where id = p_id and deleted_at is null;
  elsif p_kind = 'post' then
    select author_id, to_jsonb(t) into v_author, v_row from public.experience_posts t where id = p_id and deleted_at is null;
  else
    select author_id, to_jsonb(t) into v_author, v_row from public.comments t where id = p_id and deleted_at is null;
  end if;
  if v_row is null then raise exception 'That item does not exist or is already deleted.'; end if;

  -- No self-review: you may see reports about your own item but never act on it.
  if v_author = v_uid then
    raise exception 'This one is yours. Another reviewer will handle it.';
  end if;

  if p_kind = 'file' then
    update public.file_posts set deleted_at = now(), deleted_by = v_uid, deleted_reason = p_reason where id = p_id;
    delete from public.kb_documents where source_type = 'file-post' and source_id = p_id;
  elsif p_kind = 'post' then
    update public.experience_posts set deleted_at = now(), deleted_by = v_uid, deleted_reason = p_reason where id = p_id;
    delete from public.kb_documents where source_type = 'experience-post' and source_id = p_id;
  else
    update public.comments set deleted_at = now(), deleted_by = v_uid, deleted_reason = p_reason where id = p_id;
  end if;

  -- Reports about it are settled by this deletion; remember which, so undoing
  -- the deletion can reopen exactly those.
  perform private.clear_pins_for_item(p_kind, p_id);
  if p_kind = 'comment' then perform private.drop_kb_for_comment(p_id); end if;
  if p_kind = 'post' then perform private.drop_kb_answers_on_post(p_id); end if;
  v_report_type := case p_kind when 'file' then 'file' when 'post' then 'experience-post' else 'comment' end;
  select coalesce(array_agg(id), '{}') into v_reports
    from public.reports where target_type = v_report_type and target_id = p_id and status = 'open';
  update public.reports set status = 'resolved' where id = any (v_reports);

  perform private.log_activity(
    v_uid, 'delete', p_kind, p_id, v_author, p_reason,
    jsonb_build_object('reason_label', v_reason.label, 'resolved_reports', to_jsonb(v_reports), 'snapshot', v_row)
  );

  v_label := case p_kind when 'file' then 'file' when 'post' then 'post' else 'comment' end;
  insert into public.notifications (user_id, body, kind, data)
  values (
    v_author,
    format('Your %s was removed because it broke our rules: %s.', v_label, v_reason.label),
    'content-removed',
    jsonb_build_object('item_kind', p_kind, 'reason', p_reason)
  );
end;
$$;

-- Settle a report without acting on the content.
create or replace function public.dismiss_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report public.reports;
  v_kind text;
  v_author uuid;
  v_reason public.moderation_reasons;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;

  select * into v_report from public.reports where id = p_report_id and status = 'open';
  if not found then raise exception 'That report does not exist or is already settled.'; end if;

  v_kind := private.report_kind(v_report.target_type);
  if not private.reviewer_can(v_uid, v_kind, 'dismiss') then
    raise exception 'You are not allowed to dismiss this kind of report.';
  end if;

  select * into v_reason from public.moderation_reasons
   where code = p_reason and active and 'dismiss' = any (applies_to);
  if not found then raise exception 'Pick a reason from the list.'; end if;

  v_author := private.item_author(v_kind, v_report.target_id);
  if v_author = v_uid then
    raise exception 'This one is yours. Another reviewer will handle it.';
  end if;

  update public.reports set status = 'dismissed' where id = p_report_id;

  perform private.log_activity(
    v_uid, 'dismiss-report', 'report', p_report_id, v_author, p_reason,
    jsonb_build_object('reason_label', v_reason.label, 'report_target_type', v_report.target_type,
                       'report_target_id', v_report.target_id, 'report_reason', v_report.reason)
  );
end;
$$;

-- Creator only: put a deleted item back (the same as undoing its deletion).
create or replace function public.restore_item(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id bigint;
begin
  if auth.uid() is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can restore.';
  end if;
  select l.id into v_log_id from public.activity_log l
   where l.action = 'delete' and l.target_kind = p_kind and l.target_id = p_id
     and not exists (select 1 from public.activity_log u where u.undoes = l.id)
   order by l.id desc limit 1;
  if v_log_id is null then raise exception 'That item is not in the trash.'; end if;
  perform public.undo_activity(v_log_id);
end;
$$;

-- Creator only: everything currently in the trash, with a snapshot.
create or replace function public.list_trash()
returns table (kind text, id uuid, title text, author_id uuid, deleted_at timestamptz, deleted_by uuid, deleted_reason text, snapshot jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can see deleted items.';
  end if;
  return query
    select 'file'::text, t.id, t.title, t.author_id, t.deleted_at, t.deleted_by, t.deleted_reason, to_jsonb(t)
      from public.file_posts t where t.deleted_at is not null
    union all
    select 'post'::text, t.id, coalesce(t.title, left(t.body, 80)), t.author_id, t.deleted_at, t.deleted_by, t.deleted_reason, to_jsonb(t)
      from public.experience_posts t where t.deleted_at is not null
    union all
    select 'comment'::text, t.id, left(t.body, 80), t.author_id, t.deleted_at, t.deleted_by, t.deleted_reason, to_jsonb(t)
      from public.comments t where t.deleted_at is not null
    order by 5 desc;
end;
$$;

-- Creator only: give or take away a role. The Creator role itself is never
-- handed out here (it is set directly in the database; see RECOVERY.md).
create or replace function public.grant_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_def public.role_definitions;
  v_n integer;
  v_body text;
begin
  if v_uid is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can give roles.';
  end if;
  select * into v_def from public.role_definitions where code = p_role;
  if not found or p_role = 'creator' then raise exception 'That role cannot be given here.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'That person does not exist.'; end if;
  if p_role in ('watcher', 'deacon') and private.setting_true('require_2fa_staff')
     and not exists (select 1 from auth.mfa_factors where user_id = p_user_id and status = 'verified') then
    raise exception 'They need to turn on two-step sign-in (Settings) before they can be made a %.', v_def.label;
  end if;

  insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, v_uid)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;

  perform private.log_activity(v_uid, 'role-granted', 'user', p_user_id, p_user_id, null, jsonb_build_object('role', p_role));

  v_body := case p_role
    when 'watcher'  then 'You have been chosen by the Creator to become a Watcher. You can now see every post, comment and file, review reports, add notices, warn and delete.'
    when 'deacon'   then 'You have been chosen by the Creator to become a Deacon. You can now see every post and comment, review their reports, add notices, warn and delete.'
    when 'answerer' then 'The Creator has made you an Answerer. Your posts, files and comments are pinned to the top and an A badge appears next to your name.'
    when 'verified' then 'The Creator has verified you. A V badge appears next to your name and your comments are highlighted.'
    else format('The Creator has given you the %s role.', v_def.label)
  end;
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id, v_body, 'role-granted', jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.revoke_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_def public.role_definitions;
  v_n integer;
begin
  if v_uid is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can take roles away.';
  end if;
  select * into v_def from public.role_definitions where code = p_role;
  if not found or p_role = 'creator' then raise exception 'That role cannot be removed here.'; end if;

  delete from public.user_roles where user_id = p_user_id and role = p_role;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;

  if p_role = 'verified' then
    delete from public.verified_pins where user_id = p_user_id;
  end if;
  -- Their answers stop feeding the AI at once; if they still hold the other
  -- badge role, the next index run puts them back.
  if p_role in ('answerer', 'verified') then
    perform private.drop_kb_answers_by(p_user_id);
  end if;
  perform private.log_activity(v_uid, 'role-revoked', 'user', p_user_id, p_user_id, null, jsonb_build_object('role', p_role));
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id, format('The Creator has removed your %s role. Your account stays as it is.', v_def.label),
          'role-revoked', jsonb_build_object('role', p_role));
end;
$$;

drop function if exists public.record_account_deletion(uuid, uuid);

-- Records that the signed-in person accepted a version of a document.
create or replace function public.accept_terms(p_kind text, p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if not exists (select 1 from public.terms_versions where kind = p_kind and version = p_version) then
    raise exception 'Unknown document version.';
  end if;
  insert into public.terms_acceptances (user_id, kind, version) values (auth.uid(), p_kind, p_version)
  on conflict do nothing;
end;
$$;

-- Which current documents the signed-in person has not accepted yet, for one
-- scope ('hub' or 'marketplace'). Powers a "review and accept updated terms"
-- screen that can gate a single feature instead of the whole site.
create or replace function public.pending_terms(p_scope text default 'hub')
returns table (kind text, version text)
language sql
security definer
stable
set search_path = public
as $$
  select tv.kind, tv.version
    from public.terms_versions tv
   where tv.scope = p_scope
     and tv.published_at = (select max(t2.published_at) from public.terms_versions t2 where t2.kind = tv.kind and t2.scope = tv.scope)
     and not exists (
       select 1 from public.terms_acceptances a
        where a.user_id = auth.uid() and a.kind = tv.kind and a.version = tv.version
     );
$$;

revoke execute on function public.soft_delete_item(text, uuid, text) from public, anon;
revoke execute on function public.dismiss_report(uuid, text) from public, anon;
revoke execute on function public.restore_item(text, uuid) from public, anon;
revoke execute on function public.list_trash() from public, anon;
revoke execute on function public.grant_role(uuid, text) from public, anon;
revoke execute on function public.revoke_role(uuid, text) from public, anon;
revoke execute on function public.accept_terms(text, text) from public, anon;
revoke execute on function public.pending_terms(text) from public, anon;
grant execute on function public.soft_delete_item(text, uuid, text) to authenticated;
grant execute on function public.dismiss_report(uuid, text) to authenticated;
grant execute on function public.restore_item(text, uuid) to authenticated;
grant execute on function public.list_trash() to authenticated;
grant execute on function public.grant_role(uuid, text) to authenticated;
grant execute on function public.revoke_role(uuid, text) to authenticated;
grant execute on function public.accept_terms(text, text) to authenticated;
grant execute on function public.pending_terms(text) to authenticated;

-- ---- Retire the old is_admin flag ------------------------------------------
-- Everything above now decides by role. Anyone who held the old flag becomes
-- Creator (the closest match: they could do everything), the flag and the
-- public is_admin() function go, and from now on the Creator role is set
-- only in the database (see RECOVERY.md). Must stay last: it drops things the
-- older definitions above depended on.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin') then
    execute 'insert into public.user_roles (user_id, role) select id, ''creator'' from public.profiles where is_admin on conflict do nothing';
    execute 'alter table public.profiles drop column is_admin';
  end if;
end $$;
drop function if exists public.is_admin(uuid);
drop function if exists private.is_admin(uuid);


-- ============================================================================
-- Warnings, notices, suspension, account deletion (chat6: Warnings, Roles)
-- ============================================================================

-- Looks up an item's author and a snapshot of it (for evidence). Raises if it
-- is missing or already in the trash.
create or replace function private.item_snapshot(p_kind text, p_id uuid, out o_author uuid, out o_row jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_kind = 'file' then
    select author_id, to_jsonb(t) into o_author, o_row from public.file_posts t where id = p_id and deleted_at is null;
  elsif p_kind = 'post' then
    select author_id, to_jsonb(t) into o_author, o_row from public.experience_posts t where id = p_id and deleted_at is null;
  elsif p_kind = 'comment' then
    select author_id, to_jsonb(t) into o_author, o_row from public.comments t where id = p_id and deleted_at is null;
  end if;
  if o_row is null then raise exception 'That item does not exist or is already deleted.'; end if;
end;
$$;

-- Settles every open report on an item and returns the ids (so an undo can
-- reopen exactly those).
create or replace function private.settle_reports(p_kind text, p_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := case p_kind when 'file' then 'file' when 'post' then 'experience-post' else 'comment' end;
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from public.reports where target_type = v_type and target_id = p_id and status = 'open';
  update public.reports set status = 'resolved' where id = any (v_ids);
  return v_ids;
end;
$$;

-- Warn the person who posted something. The reason sets the level.
create or replace function public.warn_user(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_row jsonb;
  v_reason public.moderation_reasons;
  v_before integer;
  v_after integer;
  v_warning uuid;
  v_reports uuid[];
  v_restricted boolean := false;
  v_body text;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('file', 'post', 'comment') then raise exception 'Unknown kind of item.'; end if;
  if not private.reviewer_can(v_uid, p_kind, 'warn') then raise exception 'You are not allowed to warn about this kind of item.'; end if;

  select * into v_reason from public.moderation_reasons
   where code = p_reason and active and 'warn' = any (applies_to) and level is not null;
  if not found then raise exception 'Pick a reason from the list.'; end if;

  select o_author, o_row into v_author, v_row from private.item_snapshot(p_kind, p_id);
  if v_author = v_uid then raise exception 'This one is yours. Another reviewer will handle it.'; end if;

  select red into v_before from private.warning_counts(v_author);

  insert into public.warnings (user_id, item_kind, item_id, reason_code, level, issued_by, issued_role, snapshot)
  values (v_author, p_kind, p_id, p_reason, v_reason.level, v_uid, private.top_reviewer_role(v_uid), v_row)
  returning id into v_warning;

  select red into v_after from private.warning_counts(v_author);
  v_reports := private.settle_reports(p_kind, p_id);
  perform private.clear_pins_for_item(p_kind, p_id);

  -- Crossing 3 red starts the one-week restriction, once.
  if coalesce(v_before, 0) < 3 and v_after >= 3 then
    insert into public.restrictions (user_id, caused_by_warning, set_by, ends_at)
    values (v_author, v_warning, v_uid, now() + interval '7 days');
    v_restricted := true;
  end if;

  perform private.log_activity(
    v_uid, 'warn', p_kind, p_id, v_author, p_reason,
    jsonb_build_object('warning_id', v_warning, 'level', v_reason.level, 'reason_label', v_reason.label,
                       'resolved_reports', to_jsonb(v_reports), 'snapshot', v_row,
                       'record_after', private.record_text(v_author), 'restriction_started', v_restricted)
  );

  v_body := format('You received a %s warning: %s. Your record: %s. Repeated warnings lead to restrictions.',
                   v_reason.level, v_reason.label, private.record_text(v_author));
  if v_restricted then
    v_body := v_body || ' Your account is restricted for one week: you can read and download, but not post, upload or comment.';
  end if;
  insert into public.notifications (user_id, body, kind, data)
  values (v_author, v_body, 'warning', jsonb_build_object('level', v_reason.level, 'reason', p_reason, 'restricted', v_restricted));
end;
$$;

-- Add or edit the notice shown above a post, file or comment.
create or replace function public.set_notice(p_kind text, p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text;
  v_author uuid;
  v_row jsonb;
  v_prev public.item_notices;
  v_body text;
  v_reports uuid[];
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('file', 'post', 'comment') then raise exception 'Unknown kind of item.'; end if;
  if not private.reviewer_can(v_uid, p_kind, 'notice') then raise exception 'You are not allowed to add a notice here.'; end if;

  select o_author, o_row into v_author, v_row from private.item_snapshot(p_kind, p_id);
  if v_author = v_uid then raise exception 'This one is yours. Another reviewer will handle it.'; end if;

  v_tier := private.top_reviewer_role(v_uid);
  v_body := nullif(btrim(coalesce(p_body, '')), '');
  if v_body is null then v_body := 'Content below is not fully correct.'; end if;
  if char_length(v_body) > 500 then raise exception 'A notice can be at most 500 characters.'; end if;

  select * into v_prev from public.item_notices where item_kind = p_kind and item_id = p_id;
  -- Only the Creator can change or remove a notice the Creator added.
  if found and v_prev.tier = 'creator' and v_tier <> 'creator' then
    raise exception 'Only the Creator can change this notice.';
  end if;

  insert into public.item_notices (item_kind, item_id, body, tier)
  values (p_kind, p_id, v_body, v_tier)
  on conflict (item_kind, item_id) do update set body = excluded.body, tier = excluded.tier, set_at = now();

  v_reports := private.settle_reports(p_kind, p_id);
  perform private.clear_pins_for_item(p_kind, p_id);
  if p_kind = 'comment' then perform private.drop_kb_for_comment(p_id); end if;

  perform private.log_activity(
    v_uid, 'notice-set', p_kind, p_id, v_author, null,
    jsonb_build_object('body', v_body, 'tier', v_tier, 'resolved_reports', to_jsonb(v_reports),
                       'previous', case when v_prev.item_id is null then null
                                        else jsonb_build_object('body', v_prev.body, 'tier', v_prev.tier, 'set_at', v_prev.set_at) end,
                       'snapshot', v_row)
  );
end;
$$;

create or replace function public.remove_notice(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text;
  v_prev public.item_notices;
  v_author uuid;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('file', 'post', 'comment') then raise exception 'Unknown kind of item.'; end if;
  if not private.reviewer_can(v_uid, p_kind, 'notice') then raise exception 'You are not allowed to change notices here.'; end if;

  select * into v_prev from public.item_notices where item_kind = p_kind and item_id = p_id;
  if not found then raise exception 'There is no notice to remove.'; end if;

  v_tier := private.top_reviewer_role(v_uid);
  if v_prev.tier = 'creator' and v_tier <> 'creator' then raise exception 'Only the Creator can remove this notice.'; end if;

  v_author := private.item_author(p_kind, p_id);
  if v_author = v_uid then raise exception 'This one is yours. Another reviewer will handle it.'; end if;

  delete from public.item_notices where item_kind = p_kind and item_id = p_id;

  perform private.log_activity(
    v_uid, 'notice-removed', p_kind, p_id, v_author, null,
    jsonb_build_object('previous', jsonb_build_object('body', v_prev.body, 'tier', v_prev.tier, 'set_at', v_prev.set_at))
  );
end;
$$;

-- Take back a deletion, a dismissed report, a warning or a notice change
-- (Creator only). Nothing in the log is edited: an "undo" row points at the
-- original. Deletions, notices and dismissals undo newest first per item;
-- warnings can be undone in any order because counts are recalculated.
create or replace function public.undo_activity(p_log_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_log public.activity_log;
  v_report_id uuid;
  v_warning public.warnings;
  v_prev jsonb;
  v_red integer;
begin
  if v_uid is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can undo.';
  end if;

  select * into v_log from public.activity_log where id = p_log_id for update;
  if not found then raise exception 'That entry does not exist.'; end if;
  if v_log.undoes is not null then raise exception 'An undo cannot be undone.'; end if;
  if exists (select 1 from public.activity_log where undoes = p_log_id) then raise exception 'That entry was already undone.'; end if;
  if v_log.action not in ('delete', 'dismiss-report', 'warn', 'notice-set', 'notice-removed', 'suspend', 'restrict', 'delete-account') then
    raise exception 'That kind of entry cannot be undone yet.';
  end if;

  if v_log.action <> 'warn' and exists (
    select 1 from public.activity_log n
     where n.id > v_log.id and n.target_kind = v_log.target_kind and n.target_id = v_log.target_id
       and n.action not in ('warn', 'restore-account')
       and n.undoes is null
       and not exists (select 1 from public.activity_log u where u.undoes = n.id)
  ) then
    raise exception 'Undo the newer change on this item first.';
  end if;

  if v_log.action = 'delete' then
    if v_log.target_kind = 'file' then
      update public.file_posts set deleted_at = null, deleted_by = null, deleted_reason = null where id = v_log.target_id and deleted_at is not null;
    elsif v_log.target_kind = 'post' then
      update public.experience_posts set deleted_at = null, deleted_by = null, deleted_reason = null where id = v_log.target_id and deleted_at is not null;
    else
      update public.comments set deleted_at = null, deleted_by = null, deleted_reason = null where id = v_log.target_id and deleted_at is not null;
    end if;
    if not found then raise exception 'The item no longer exists.'; end if;

  elsif v_log.action = 'dismiss-report' then
    update public.reports set status = 'open' where id = v_log.target_id and status = 'dismissed';
    if not found then raise exception 'The report no longer exists.'; end if;

  elsif v_log.action = 'warn' then
    select * into v_warning from public.warnings where id = (v_log.details ->> 'warning_id')::uuid for update;
    if not found or v_warning.undone_at is not null then raise exception 'That warning was already undone.'; end if;
    update public.warnings set undone_at = now(), undone_by = v_uid where id = v_warning.id;

    select red into v_red from private.warning_counts(v_warning.user_id);
    if v_red < 3 then
      update public.restrictions set lifted_at = now(), lifted_reason = 'A warning was withdrawn'
       where user_id = v_warning.user_id and lifted_at is null and ends_at > now();
    end if;
    insert into public.notifications (user_id, body, kind, data)
    values (v_warning.user_id,
            format('A warning was withdrawn. Your record is now: %s.', private.record_text(v_warning.user_id)),
            'warning-withdrawn', jsonb_build_object('warning_id', v_warning.id));

  elsif v_log.action in ('suspend', 'delete-account') then
    if (select account_status from public.profiles where id = v_log.target_id)
       is distinct from (case v_log.action when 'suspend' then 'suspended' else 'deleted' end) then
      raise exception 'That account is no longer %.', case v_log.action when 'suspend' then 'suspended' else 'deleted' end;
    end if;
    perform private.apply_account_status(v_uid, v_log.target_id, 'active', null);
    insert into public.notifications (user_id, body, kind, data)
    values (v_log.target_id,
            case v_log.action when 'suspend' then 'Your suspension was lifted. You can use your account again.' else 'Your account was restored.' end,
            'account-restored', jsonb_build_object('undid', v_log.action));

  elsif v_log.action = 'restrict' then
    update public.restrictions set lifted_at = now(), lifted_reason = 'Undone by the Creator'
     where id = (v_log.details ->> 'restriction_id')::uuid and lifted_at is null;
    insert into public.notifications (user_id, body, kind, data)
    values (v_log.target_id, 'Your restriction was lifted.', 'restriction-lifted', '{}'::jsonb);

  elsif v_log.action in ('notice-set', 'notice-removed') then
    v_prev := v_log.details -> 'previous';
    if v_prev is null or jsonb_typeof(v_prev) = 'null' then
      delete from public.item_notices where item_kind = v_log.target_kind and item_id = v_log.target_id;
    else
      insert into public.item_notices (item_kind, item_id, body, tier, set_at)
      values (v_log.target_kind, v_log.target_id, v_prev ->> 'body', v_prev ->> 'tier', (v_prev ->> 'set_at')::timestamptz)
      on conflict (item_kind, item_id) do update set body = excluded.body, tier = excluded.tier, set_at = excluded.set_at;
    end if;
  end if;

  -- Reports that this action had settled come back, exactly as they were.
  if v_log.action in ('delete', 'warn', 'notice-set') then
    for v_report_id in select (jsonb_array_elements_text(coalesce(v_log.details -> 'resolved_reports', '[]'::jsonb)))::uuid loop
      update public.reports set status = 'open' where id = v_report_id and status = 'resolved';
    end loop;
  end if;

  perform private.log_activity(
    v_uid, 'undo', v_log.target_kind, v_log.target_id, v_log.subject_user_id, v_log.reason_code,
    jsonb_build_object('undid_action', v_log.action), p_log_id
  );
end;
$$;

-- Emergency suspension (a Watcher or the Creator; never a Deacon). Takes effect
-- at once: the account cannot sign in, post, upload or comment and its
-- content is hidden until the Creator decides.
create or replace function public.suspend_account(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason public.moderation_reasons;
  v_status text;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if not private.reviewer_can(v_uid, 'user', 'suspend') then raise exception 'You are not allowed to suspend accounts.'; end if;
  if p_user_id = v_uid then raise exception 'You cannot suspend yourself.'; end if;
  if private.is_reviewer(p_user_id) then
    raise exception 'Staff accounts cannot be suspended here. Ask the Creator to remove the role first.';
  end if;

  select * into v_reason from public.moderation_reasons
   where code = p_reason and active and 'suspend' = any (applies_to);
  if not found then raise exception 'Pick a reason from the list.'; end if;

  if (select count(*) from public.activity_log
       where actor_id = v_uid and action = 'suspend' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many suspensions in the last hour. Ask the Creator.';
  end if;

  select account_status into v_status from public.profiles where id = p_user_id;
  if v_status is null then raise exception 'That person does not exist.'; end if;
  if v_status <> 'active' then raise exception 'That account is already suspended or deleted.'; end if;

  update public.profiles
     set account_status = 'suspended', account_status_reason = p_reason, account_status_by = v_uid, account_status_changed_at = now()
   where id = p_user_id;
  -- A far-future date, not 'infinity': the auth service cannot read infinity
  -- and would answer "Database error querying schema" instead of "banned".
  update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
  perform private.drop_kb_for_author(p_user_id);

  perform private.log_activity(v_uid, 'suspend', 'user', p_user_id, p_user_id, p_reason,
                               jsonb_build_object('reason_label', v_reason.label));

  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id,
          format('Your account was suspended while the hub''s Creator reviews it. Reason: %s.', v_reason.label),
          'account-suspended', jsonb_build_object('reason', p_reason));
  perform private.notify_creators(
    format('An account was suspended for: %s. Open the Creator panel to review it.', v_reason.label),
    'suspension-review', jsonb_build_object('user_id', p_user_id, 'reason', p_reason));
end;
$$;

-- Creator only: set an account's standing. 'active' lifts a suspension or
-- restores a deleted account (within the 30 days); 'deleted' disables it.
-- Moves an account between active / suspended / deleted: the status, the
-- sign-in ban, the AI's copy of their content and any open referral. Used by
-- set_account_status() and by undo_activity(). Returns the previous status.
create or replace function private.apply_account_status(p_actor uuid, p_user uuid, p_status text, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  select account_status into v_old from public.profiles where id = p_user for update;
  if v_old is null then raise exception 'That person does not exist.'; end if;

  update public.profiles
     set account_status = p_status, account_status_reason = p_reason, account_status_by = p_actor,
         account_status_changed_at = now()
   where id = p_user;
  -- A far-future date, not 'infinity': the auth service cannot read infinity
  -- and would answer "Database error querying schema" instead of "banned".
  update auth.users
     set banned_until = case when p_status = 'active' then null else now() + interval '100 years' end
   where id = p_user;

  if p_status <> 'active' then
    perform private.drop_kb_for_author(p_user);
  end if;
  if p_status = 'deleted' then
    update public.account_referrals set status = 'deleted', decided_by = p_actor, decided_at = now()
     where user_id = p_user and status = 'open';
  end if;
  return v_old;
end;
$$;

-- Creator only: set an account's standing. 'active' lifts a suspension or
-- restores a deleted account (within the 30 days) and is recorded as an undo
-- of the suspension/deletion; 'deleted' disables it.
create or replace function public.set_account_status(p_user_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_profile jsonb;
  v_prior bigint;
begin
  if v_uid is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  if p_status not in ('active', 'deleted') then raise exception 'Unknown status.'; end if;
  if p_user_id = v_uid then raise exception 'You cannot change your own account here.'; end if;
  if p_status = 'deleted' and private.has_role(p_user_id, 'creator') then raise exception 'The Creator account cannot be deleted here.'; end if;

  select to_jsonb(p) into v_profile from public.profiles p where id = p_user_id;
  v_old := private.apply_account_status(v_uid, p_user_id, p_status, p_reason);
  if v_old = p_status then return; end if;

  if p_status = 'deleted' then
    perform private.log_activity(v_uid, 'delete-account', 'user', p_user_id, p_user_id, null,
                                 jsonb_build_object('from', v_old, 'by', 'creator', 'profile', v_profile));
  else
    -- Lifting a suspension or restoring a deleted account IS the undo of it.
    select l.id into v_prior from public.activity_log l
     where l.target_kind = 'user' and l.target_id = p_user_id and l.action in ('suspend', 'delete-account')
       and not exists (select 1 from public.activity_log u where u.undoes = l.id)
     order by l.id desc limit 1;
    if v_prior is not null then
      perform private.log_activity(v_uid, 'undo', 'user', p_user_id, p_user_id, null,
                                   jsonb_build_object('undid_action', (select action from public.activity_log where id = v_prior)), v_prior);
    else
      perform private.log_activity(v_uid, 'restore-account', 'user', p_user_id, p_user_id, null, jsonb_build_object('from', v_old));
    end if;
    insert into public.notifications (user_id, body, kind, data)
    values (p_user_id, case when v_old = 'suspended' then 'Your suspension was lifted. You can use your account again.'
                            else 'Your account was restored.' end,
            'account-restored', jsonb_build_object('from', v_old));
  end if;
end;
$$;

-- Any member may delete their own account. It is disabled and hidden at once
-- and erased for good after 30 days; until then the Creator can restore it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if private.has_role(v_uid, 'creator') then
    raise exception 'The Creator account cannot be deleted from here. See RECOVERY.md.';
  end if;
  select to_jsonb(p) into v_profile from public.profiles p where id = v_uid and account_status <> 'deleted';
  if v_profile is null then raise exception 'That account is already deleted.'; end if;

  update public.profiles
     set account_status = 'deleted', account_status_reason = 'deleted by the member', account_status_by = v_uid,
         account_status_changed_at = now()
   where id = v_uid;
  update auth.users set banned_until = now() + interval '100 years' where id = v_uid;
  perform private.drop_kb_for_author(v_uid);

  perform private.log_activity(v_uid, 'delete-account', 'user', v_uid, v_uid, null,
                               jsonb_build_object('by', 'self', 'profile', v_profile));
end;
$$;

-- Creator only: apply the normal one-week restriction by hand (for example
-- after reviewing a suspension).
create or replace function public.restrict_account(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason public.moderation_reasons;
  v_restriction uuid;
begin
  if v_uid is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  select * into v_reason from public.moderation_reasons where code = p_reason and active and 'warn' = any (applies_to);
  if not found then raise exception 'Pick a reason from the list.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'That person does not exist.'; end if;

  insert into public.restrictions (user_id, set_by, ends_at) values (p_user_id, v_uid, now() + interval '7 days')
  returning id into v_restriction;
  perform private.log_activity(v_uid, 'restrict', 'user', p_user_id, p_user_id, p_reason,
                               jsonb_build_object('reason_label', v_reason.label, 'days', 7, 'restriction_id', v_restriction));
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id, 'Your account is restricted for one week: you can read and download, but not post, upload or comment.',
          'restriction', jsonb_build_object('reason', p_reason));
end;
$$;

-- A Watcher or Deacon reports an account to the Creator once it reaches 5 red.
create or replace function public.report_to_creator(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_red integer;
begin
  if v_uid is null or not (private.has_role(v_uid, 'watcher') or private.has_role(v_uid, 'deacon')) then
    raise exception 'Only a Watcher or Deacon can report an account to the Creator.';
  end if;
  if p_user_id = v_uid then raise exception 'You cannot report yourself.'; end if;
  select red into v_red from private.warning_counts(p_user_id);
  if v_red < 5 then raise exception 'An account can be reported to the Creator once it has 5 red warnings.'; end if;
  if exists (select 1 from public.account_referrals where user_id = p_user_id and status = 'open') then
    raise exception 'This account has already been reported.';
  end if;

  insert into public.account_referrals (user_id, reported_by) values (p_user_id, v_uid);
  perform private.log_activity(v_uid, 'report-to-creator', 'user', p_user_id, p_user_id, null,
                               jsonb_build_object('record', private.record_text(p_user_id)));
  perform private.notify_creators('An account was reported to you at 5 red warnings. Open the Creator panel → Accounts.',
                                  'account-referral', jsonb_build_object('user_id', p_user_id));
end;
$$;

-- Creator only: decide a referral.
create or replace function public.decide_referral(p_referral_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ref public.account_referrals;
begin
  if v_uid is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  if p_decision not in ('delete', 'dismiss') then raise exception 'Unknown decision.'; end if;
  select * into v_ref from public.account_referrals where id = p_referral_id and status = 'open' for update;
  if not found then raise exception 'That report does not exist or was already decided.'; end if;

  if p_decision = 'delete' then
    perform public.set_account_status(v_ref.user_id, 'deleted', 'repeated violations');
  else
    update public.account_referrals set status = 'dismissed', decided_by = v_uid, decided_at = now() where id = p_referral_id;
    perform private.log_activity(v_uid, 'dismiss-referral', 'user', v_ref.user_id, v_ref.user_id, null, '{}'::jsonb);
  end if;
end;
$$;

-- What reviewers see next to a person's name: a count in words, never the
-- warnings themselves.
create or replace function public.warning_summaries(p_user_ids uuid[])
returns table (user_id uuid, green integer, yellow integer, red integer, restricted boolean, account_status text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.is_reviewer(auth.uid()) then raise exception 'Reviewers only.'; end if;
  return query
    select p.id, c.green, c.yellow, c.red, private.is_restricted(p.id), p.account_status
      from public.profiles p, lateral private.warning_counts(p.id) c
     where p.id = any (p_user_ids);
end;
$$;

-- Creator only: everything on record about one person, for review or to hand
-- to a lawyer.
create or replace function public.person_evidence(p_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id),
    'record', private.record_text(p_user_id),
    'warnings', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at) from public.warnings w where w.user_id = p_user_id), '[]'::jsonb),
    'restrictions', coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at) from public.restrictions r where r.user_id = p_user_id), '[]'::jsonb),
    'referrals', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.account_referrals a where a.user_id = p_user_id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.activity_log l where l.subject_user_id = p_user_id), '[]'::jsonb)
  );
end;
$$;

-- ---- Erasing for good (30 days after deletion) ------------------------------
-- Run by the server (service role) from /api/cron/purge-trash, which first
-- deletes the stored files listed by list_expired_storage().


create or replace function public.purge_expired(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => p_days);
  v_files integer;
  v_posts integer;
  v_comments integer;
  v_accounts integer;
  v_ids uuid[];
begin
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
      jsonb_build_object('file_posts', v_files, 'posts', v_posts, 'comments', v_comments, 'accounts', v_accounts, 'days', p_days));
  end if;
  return jsonb_build_object('file_posts', v_files, 'posts', v_posts, 'comments', v_comments, 'accounts', v_accounts);
end;
$$;

grant execute on function private.item_snapshot(text, uuid) to service_role;
grant execute on function private.settle_reports(text, uuid) to service_role;
grant execute on function private.notify_creators(text, text, jsonb) to service_role;
grant execute on function private.drop_kb_for_author(uuid) to service_role;

-- A Verified member pins one of their own posts or files to "From verified
-- voices". Refused if the item carries a notice or a warning.
create or replace function public.pin_my_item(p_board text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.has_role(v_uid, 'verified') then raise exception 'Only Verified members can pin here.'; end if;
  if p_board not in ('file', 'post') then raise exception 'Unknown board.'; end if;
  if private.item_author(p_board, p_item_id) is distinct from v_uid then raise exception 'You can only pin your own items.'; end if;
  if (p_board = 'file' and not exists (select 1 from public.file_posts where id = p_item_id and deleted_at is null))
     or (p_board = 'post' and not exists (select 1 from public.experience_posts where id = p_item_id and deleted_at is null)) then
    raise exception 'That item is not available.';
  end if;
  if exists (select 1 from public.item_notices where item_kind = p_board and item_id = p_item_id) then
    raise exception 'An item with a notice cannot be pinned.';
  end if;
  if exists (select 1 from public.warnings where item_kind = p_board and item_id = p_item_id and undone_at is null) then
    raise exception 'An item that received a warning cannot be pinned.';
  end if;

  insert into public.verified_pins (user_id, board, item_id) values (v_uid, p_board, p_item_id)
  on conflict (user_id, board) do update set item_id = excluded.item_id, pinned_at = now();
end;
$$;

create or replace function public.unpin_my_item(p_board text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.verified_pins where user_id = auth.uid() and board = p_board;
$$;


-- ============================================================================
-- Creator access: the functions the panel uses (chat6: recovery keys, wrong
-- code lockout, security events). Wrong attempts are RETURNED, not raised,
-- so that the attempt is still recorded (a raised error would roll it back).
-- ============================================================================

create or replace function private.recent_events(p_user uuid, p_kind text, p_minutes integer)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.creator_security_events
   where user_id = p_user and kind = p_kind and at > now() - make_interval(mins => p_minutes);
$$;

create or replace function private.add_event(p_user uuid, p_kind text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.creator_security_events (user_id, kind, details) values (p_user, p_kind, coalesce(p_details, '{}'::jsonb));
$$;

-- What the unlock screen needs to decide the next step.
create or replace function public.creator_status()
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wrong integer;
  v_last timestamptz;
begin
  if v_uid is null or not private.has_role(v_uid, 'creator') then
    return jsonb_build_object('is_creator', false);
  end if;
  v_wrong := private.recent_events(v_uid, 'code-wrong', 15) + private.recent_events(v_uid, 'key-wrong', 15);
  select max(at) into v_last from public.creator_security_events
   where user_id = v_uid and kind in ('code-wrong', 'key-wrong') and at > now() - interval '15 minutes';
  return jsonb_build_object(
    'is_creator', true,
    'has_code', exists (select 1 from public.creator_access where user_id = v_uid),
    'has_factor', exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified'),
    'aal2', private.is_aal2(),
    'unlocked', private.creator_unlocked(true),
    'locked', v_wrong >= 5,
    'locked_until', case when v_wrong >= 5 then v_last + interval '15 minutes' end,
    'keys_left', (select count(*) from public.creator_recovery_keys where user_id = v_uid and used_at is null)
  );
end;
$$;

-- Sets or changes the access code. First time: needs two-step sign-in. After
-- that: needs an unlocked session, or the current code.
create or replace function public.set_creator_code(p_new text, p_current text default null)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := private.session_id();
  v_hash text;
begin
  if v_uid is null or v_sid is null or not private.has_role(v_uid, 'creator') then raise exception 'Only the Creator can do this.'; end if;
  if not private.is_aal2() then raise exception 'Finish two-step sign-in first.'; end if;
  if p_new is null or char_length(p_new) < 10 then raise exception 'Use at least 10 characters for the access code.'; end if;

  select code_hash into v_hash from public.creator_access where user_id = v_uid;
  if v_hash is not null then
    if not private.creator_unlocked(false) and (p_current is null or crypt(p_current, v_hash) <> v_hash) then
      return jsonb_build_object('ok', false, 'error', 'The current code is not right.');
    end if;
  end if;

  insert into public.creator_access (user_id, code_hash) values (v_uid, crypt(p_new, gen_salt('bf')))
  on conflict (user_id) do update set code_hash = excluded.code_hash, updated_at = now();

  insert into public.creator_sessions (session_id, user_id, via) values (v_sid, v_uid, 'code')
  on conflict (session_id) do update set last_used_at = now(), via = 'code';
  perform private.add_event(v_uid, case when v_hash is null then 'code-created' else 'code-changed' end);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.verify_creator_code(p_code text)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := private.session_id();
  v_hash text;
  v_wrong integer;
begin
  if v_uid is null or v_sid is null or not private.has_role(v_uid, 'creator') then raise exception 'Only the Creator can do this.'; end if;
  if not private.is_aal2() then raise exception 'Finish two-step sign-in first.'; end if;

  v_wrong := private.recent_events(v_uid, 'code-wrong', 15) + private.recent_events(v_uid, 'key-wrong', 15);
  if v_wrong >= 5 then
    return jsonb_build_object('ok', false, 'locked', true, 'error', 'Too many wrong tries. Try again in 15 minutes, or use a recovery key.');
  end if;

  select code_hash into v_hash from public.creator_access where user_id = v_uid;
  if v_hash is null then return jsonb_build_object('ok', false, 'error', 'No access code has been set yet.'); end if;

  if crypt(coalesce(p_code, ''), v_hash) = v_hash then
    insert into public.creator_sessions (session_id, user_id, via) values (v_sid, v_uid, 'code')
    on conflict (session_id) do update set last_used_at = now(), via = 'code', verified_at = now();
    perform private.add_event(v_uid, 'code-ok');
    return jsonb_build_object('ok', true);
  end if;

  perform private.add_event(v_uid, 'code-wrong');
  return jsonb_build_object('ok', false, 'attempts_left', greatest(0, 4 - v_wrong),
                            'error', 'That code is not right.');
end;
$$;

-- A recovery key works once. It lets the Creator back in when the code or the
-- authenticator device is lost; the session it opens is a "recovery" session.
create or replace function public.use_recovery_key(p_key text)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := private.session_id();
  v_wrong integer;
  v_key public.creator_recovery_keys;
begin
  if v_uid is null or v_sid is null or not private.has_role(v_uid, 'creator') then raise exception 'Only the Creator can do this.'; end if;

  v_wrong := private.recent_events(v_uid, 'code-wrong', 15) + private.recent_events(v_uid, 'key-wrong', 15);
  if v_wrong >= 5 then
    return jsonb_build_object('ok', false, 'locked', true, 'error', 'Too many wrong tries. Try again in 15 minutes.');
  end if;

  for v_key in select * from public.creator_recovery_keys where user_id = v_uid and used_at is null loop
    if crypt(upper(btrim(coalesce(p_key, ''))), v_key.key_hash) = v_key.key_hash then
      update public.creator_recovery_keys set used_at = now() where id = v_key.id;
      insert into public.creator_sessions (session_id, user_id, via) values (v_sid, v_uid, 'recovery')
      on conflict (session_id) do update set last_used_at = now(), via = 'recovery', verified_at = now();
      perform private.add_event(v_uid, 'recovery-used');
      perform private.log_activity(v_uid, 'recovery-key-used', 'user', v_uid, v_uid, null, '{}'::jsonb);
      insert into public.notifications (user_id, body, kind, data)
      values (v_uid, 'A recovery key was just used to open the Creator panel. If that was not you, create new keys and change the access code now.',
              'security-alert', '{}'::jsonb);
      return jsonb_build_object('ok', true,
        'keys_left', (select count(*) from public.creator_recovery_keys where user_id = v_uid and used_at is null));
    end if;
  end loop;

  perform private.add_event(v_uid, 'key-wrong');
  return jsonb_build_object('ok', false, 'error', 'That key is not right, or was already used.');
end;
$$;

-- Makes a fresh set of 6 one-time keys and replaces any unused ones. The
-- plain keys are returned ONCE; only hashes are stored.
create or replace function public.create_recovery_keys()
returns text[]
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_keys text[] := '{}';
  v_key text;
  i integer;
begin
  if v_uid is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  delete from public.creator_recovery_keys where user_id = v_uid and used_at is null;
  for i in 1..6 loop
    v_key := 'AOE-RK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-'
                      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-'
                      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    insert into public.creator_recovery_keys (user_id, key_hash) values (v_uid, crypt(v_key, gen_salt('bf')));
    v_keys := v_keys || v_key;
  end loop;
  perform private.add_event(v_uid, 'keys-created');
  return v_keys;
end;
$$;

-- Puts the panel back behind the code now.
create or replace function public.lock_creator_panel()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.creator_sessions where session_id = private.session_id() and user_id = auth.uid();
$$;

create or replace function public.creator_security_events_list()
returns table (at timestamptz, kind text)
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  return query select e.at, e.kind from public.creator_security_events e where e.user_id = auth.uid() order by e.id desc limit 25;
end;
$$;

create or replace function public.get_hub_settings()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(false) then raise exception 'Unlock the Creator panel first.'; end if;
  return coalesce((select jsonb_object_agg(key, value) from public.hub_settings), '{}'::jsonb);
end;
$$;

create or replace function public.set_hub_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if p_key = 'require_2fa_staff' then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'That setting is on or off.'; end if;
  elsif p_key = 'upload_daily_files' then
    if jsonb_typeof(p_value) <> 'number' or (p_value)::numeric < 0 or (p_value)::numeric > 1000000 or (p_value)::numeric <> trunc((p_value)::numeric) then
      raise exception 'Use a whole number of files between 0 and 1,000,000.';
    end if;
  elsif p_key = 'upload_daily_bytes' then
    if jsonb_typeof(p_value) <> 'number' or (p_value)::numeric < 0 or (p_value)::numeric > 10000000000000 or (p_value)::numeric <> trunc((p_value)::numeric) then
      raise exception 'Use a size between 0 and 10 TB.';
    end if;
  elsif p_key = 'upload_max_file_bytes' then
    if jsonb_typeof(p_value) <> 'number' or (p_value)::numeric < 1048576 or (p_value)::numeric > 2146435072 or (p_value)::numeric <> trunc((p_value)::numeric) then
      raise exception 'Use a size between 1 MB and 2 GB (the scanner cannot check more).';
    end if;
  else
    raise exception 'Unknown setting.';
  end if;
  insert into public.hub_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null,
                               jsonb_build_object('key', p_key, 'value', p_value));
end;
$$;

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
    'used_files', coalesce(v_use.files, 0), 'used_bytes', coalesce(v_use.bytes, 0),
    'one_time_max_file_bytes', v_ov.one_time_max_file_bytes);
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
-- Virus scanner and large uploads (Step 7, scanner)
-- A file is sent by the browser straight to a private staging bucket, scanned by
-- the ClamAV service, and only if clean moved to its final place. Until then the
-- row is hidden from everyone but the uploader and reviewers.
--   uploading : the file is still being sent
--   pending   : sent; waiting for (or in) the scan
--   clean     : safe; downloadable
--   flagged   : the scanner caught something; the file was deleted
--   error     : the scanner could not finish; the file was deleted, upload again
-- ============================================================================
alter table public.file_assets drop constraint if exists file_assets_scan_status_check;
alter table public.file_assets add constraint file_assets_scan_status_check
  check (scan_status in ('uploading', 'pending', 'clean', 'flagged', 'error'));
alter table public.file_assets add column if not exists staging_key text;
alter table public.file_assets add column if not exists final_key text;
alter table public.file_assets add column if not exists final_backend text check (final_backend is null or final_backend in ('r2', 'internet-archive'));
alter table public.file_assets add column if not exists original_name text;
alter table public.file_assets add column if not exists scan_signature text;
alter table public.file_assets add column if not exists scan_attempts integer not null default 0;
alter table public.file_assets add column if not exists scan_started_at timestamptz;
alter table public.file_assets add column if not exists scan_finished_at timestamptz;
alter table public.file_assets add column if not exists multipart_upload_id text;
-- The fingerprint (ETag) of the sealed copy that is scanned and published. The
-- upload is copied to a new key nobody can write to when it is complete, and the
-- scanner refuses to scan or move anything that does not match this (AOE-SEC-01).
alter table public.file_assets add column if not exists staged_etag text;
-- When a stored file was last re-checked against fresh virus signatures (weekly job).
alter table public.file_assets add column if not exists rescanned_at timestamptz;
create index if not exists file_assets_rescan_idx on public.file_assets (rescanned_at nulls first, scan_finished_at) where scan_status = 'clean' and storage_path is not null;
create index if not exists file_assets_unfinished_idx on public.file_assets (scan_status) where scan_status in ('uploading', 'pending');

-- The VirusTotal analysis id is no longer used.
alter table public.file_assets drop column if exists scan_analysis_id;

-- Largest single file a member may upload. The Creator can change the default
-- and, once, lift it for one member who asks (the lift is used up by the next
-- upload that needs it). The scanner's own ceiling is just under 2 GB (2047 MB).
insert into public.hub_settings (key, value) values ('upload_max_file_bytes', '1073741824'::jsonb)
on conflict (key) do nothing;
alter table public.member_upload_limits add column if not exists one_time_max_file_bytes bigint
  check (one_time_max_file_bytes is null or (one_time_max_file_bytes > 0 and one_time_max_file_bytes <= 2146435072));

-- Server only: the largest file this member may send now, and the one-time lift (if any).
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

-- Server only: takes one pending file for scanning (atomic, so two triggers cannot
-- scan the same file at once). Returns nothing when it is already being scanned.
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

-- Server only: the lift has been used.
create or replace function public.consume_one_time_max(p_user uuid)
returns void
language sql
security definer
volatile
set search_path = public
as $$
  update public.member_upload_limits set one_time_max_file_bytes = null, updated_at = now() where user_id = p_user;
$$;

-- Creator panel: allow one member a single bigger upload (null takes it back).
create or replace function public.set_member_one_time_max(p_user_id uuid, p_bytes bigint)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'No such member.'; end if;
  if p_bytes is not null and (p_bytes <= 0 or p_bytes > 2146435072) then raise exception 'A one-time lift can be at most 2 GB.'; end if;
  insert into public.member_upload_limits (user_id, one_time_max_file_bytes) values (p_user_id, p_bytes)
  on conflict (user_id) do update set one_time_max_file_bytes = excluded.one_time_max_file_bytes, updated_at = now();
  perform private.log_activity(auth.uid(), 'setting-changed', 'user', p_user_id, p_user_id, null,
                               jsonb_build_object('key', 'one_time_max_file', 'bytes', p_bytes));
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
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists post_media_owner_idx on public.post_media (owner_type, owner_id, sort_order);
-- Preview videos wait in the private staging bucket for the virus scanner (see the
-- scanner section above); the old VirusTotal analysis id is gone.
alter table public.post_media add column if not exists staging_key text;
alter table public.post_media add column if not exists final_key text;
alter table public.post_media add column if not exists scan_attempts integer not null default 0;
alter table public.post_media add column if not exists scan_started_at timestamptz;
alter table public.post_media drop column if exists scan_analysis_id;
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
  select pr.id, 'r2'::text, pr.avatar_path, null::text
    from public.profiles pr
   where pr.avatar_path is not null and pr.account_status = 'deleted'
     and pr.account_status_changed_at < now() - make_interval(days => p_days)
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

-- ============================================================================
-- Urgent reports, copyright takedown notices and appeals (Step 7)
-- ============================================================================

-- Urgent report: a serious safety concern. Shown first to every reviewer, and
-- the Creator is told at once.
alter table public.reports add column if not exists urgent boolean not null default false;
alter table public.reports add column if not exists takedown_id uuid;
-- A formal copyright notice can come from someone with no account.
alter table public.reports alter column reported_by drop not null;
create index if not exists reports_urgent_idx on public.reports (urgent) where status = 'open';

create or replace function private.notify_urgent_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, body, kind, data)
  select r.user_id, 'An urgent report needs attention. Open the Creator panel to see it.', 'urgent-report', jsonb_build_object('report_id', new.id)
    from public.user_roles r where r.role = 'creator';
  return new;
end;
$$;
drop trigger if exists reports_urgent_notify on public.reports;
create trigger reports_urgent_notify after insert on public.reports
  for each row when (new.urgent) execute function private.notify_urgent_report();

-- A formal copyright takedown notice (anyone may send one, account or not).
-- Written only by the server; read by the reviewers who can see the linked report.
create table if not exists public.takedown_notices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  claimant_name text not null check (char_length(claimant_name) between 2 and 200),
  claimant_email text not null check (char_length(claimant_email) between 5 and 200),
  claimant_address text check (claimant_address is null or char_length(claimant_address) <= 500),
  rights_holder text check (rights_holder is null or char_length(rights_holder) <= 200),
  original_work text not null check (char_length(original_work) between 10 and 2000),
  infringing_url text not null check (char_length(infringing_url) between 5 and 500),
  target_type text check (target_type in ('file', 'experience-post', 'comment')),
  target_id uuid,
  good_faith boolean not null,
  accuracy_statement boolean not null,
  signature text not null check (char_length(signature) between 2 and 200),
  status text not null default 'open' check (status in ('open', 'removed', 'rejected')),
  report_id uuid
);
alter table public.takedown_notices enable row level security;
drop policy if exists "reviewers read takedown notices of reports they can see" on public.takedown_notices;
create policy "reviewers read takedown notices of reports they can see" on public.takedown_notices
  for select using (
    private.creator_unlocked(false)
    or (report_id is not null and exists (select 1 from public.reports r where r.id = report_id))
  );

-- Appeals: a member contests a warning or a restriction (or asks about another decision).
create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('warning', 'restriction', 'other')),
  subject_id uuid,
  message text not null check (char_length(message) between 10 and 1500),
  status text not null default 'open' check (status in ('open', 'upheld', 'recommend-overturn', 'overturned')),
  decided_by uuid,
  decided_role text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now()
);
create unique index if not exists appeals_one_open on public.appeals (user_id, kind, subject_id)
  where status in ('open', 'recommend-overturn') and subject_id is not null;
alter table public.appeals enable row level security;
drop policy if exists "members read their own appeals" on public.appeals;
create policy "members read their own appeals" on public.appeals for select using (auth.uid() = user_id);

-- Appeal messages are translated for the reviewer who reads them (and the
-- translation is removed with the appeal). Policy pages (item_id 'slug@version')
-- are translated for readers of other languages.
alter table public.content_translations drop constraint if exists content_translations_item_type_check;
alter table public.content_translations add constraint content_translations_item_type_check
  check (item_type in ('experience-post', 'file', 'comment', 'notice', 'notification', 'appeal', 'policy'));
drop trigger if exists drop_translations_appeal on public.appeals;
create trigger drop_translations_appeal after delete on public.appeals
  for each row execute function private.drop_translations('appeal');

-- What a member can appeal, and what they already did.
create or replace function public.my_standing()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  return jsonb_build_object(
    'warnings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'reason', w.reason_code, 'level', w.level, 'created_at', w.created_at, 'item_kind', w.item_kind,
               'title', coalesce(nullif(w.snapshot ->> 'title', ''), left(coalesce(w.snapshot ->> 'body', w.snapshot ->> 'description', ''), 80)))
             order by w.created_at desc)
        from public.warnings w
       where w.user_id = v_uid and w.undone_at is null and w.created_at > now() - interval '180 days'), '[]'::jsonb),
    'restriction', (
      select jsonb_build_object('id', x.id, 'ends_at', x.ends_at)
        from public.restrictions x where x.user_id = v_uid and x.lifted_at is null and x.ends_at > now()
       order by x.ends_at desc limit 1),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'subject_id', a.subject_id, 'status', a.status,
                                          'decision_note', a.decision_note, 'created_at', a.created_at, 'message', a.message)
             order by a.created_at desc)
        from public.appeals a where a.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

create or replace function public.file_appeal(p_kind text, p_subject uuid, p_message text)
returns uuid
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('warning', 'restriction', 'other') then raise exception 'Unknown kind of appeal.'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 10 and 1500 then raise exception 'Please explain in 10 to 1,500 characters.'; end if;
  if (select count(*) from public.appeals where user_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'You have sent several appeals today. Please wait a day.';
  end if;
  if p_kind = 'warning' and not exists (select 1 from public.warnings where id = p_subject and user_id = v_uid and undone_at is null) then
    raise exception 'That warning is not on your record.';
  end if;
  if p_kind = 'restriction' and not exists (select 1 from public.restrictions where id = p_subject and user_id = v_uid and lifted_at is null and ends_at > now()) then
    raise exception 'That restriction is not in force.';
  end if;
  if p_kind = 'other' then p_subject := null; end if;
  begin
    insert into public.appeals (user_id, kind, subject_id, message) values (v_uid, p_kind, p_subject, btrim(p_message)) returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have an appeal open for this.';
  end;
  return v_id;
end;
$$;

-- May this reviewer handle this appeal? Never the appellant; never the reviewer
-- who made the decision; a Creator decision can only be handled by the Creator.
create or replace function private.can_handle_appeal(p_viewer uuid, p_kind text, p_user uuid, p_subject uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_by uuid;
  v_role text;
  v_item text;
begin
  if p_viewer is null or p_viewer = p_user then return false; end if;
  if p_kind = 'warning' then
    select issued_by, issued_role, item_kind into v_by, v_role, v_item from public.warnings where id = p_subject;
  elsif p_kind = 'restriction' then
    select set_by into v_by from public.restrictions where id = p_subject;
    v_role := private.top_reviewer_role(v_by);
  end if;
  if private.creator_unlocked(false) then return true; end if;
  if p_kind = 'other' or v_role = 'creator' then return false; end if;
  if v_by is not null and p_viewer = v_by then return false; end if;
  if private.has_role(p_viewer, 'watcher') and private.reviewer_can(p_viewer, 'comment', 'view') then return true; end if;
  if private.has_role(p_viewer, 'deacon') and p_kind = 'warning' and v_item in ('post', 'comment') and private.reviewer_can(p_viewer, 'comment', 'view') then return true; end if;
  return false;
end;
$$;

create or replace function public.list_appeals()
returns table (id uuid, user_id uuid, appellant text, kind text, subject_id uuid, message text, status text, created_at timestamptz,
               reason_code text, level text, item_kind text, item_title text, ends_at timestamptz, i_am_creator boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.is_reviewer(v_uid) then raise exception 'Not allowed.'; end if;
  return query
    select a.id, a.user_id, coalesce(nullif(p.display_name, ''), p.name), a.kind, a.subject_id, a.message, a.status, a.created_at,
           w.reason_code, w.level, w.item_kind,
           coalesce(nullif(w.snapshot ->> 'title', ''), left(coalesce(w.snapshot ->> 'body', w.snapshot ->> 'description', ''), 100)),
           x.ends_at, private.creator_unlocked(false)
      from public.appeals a
      join public.profiles p on p.id = a.user_id
      left join public.warnings w on a.kind = 'warning' and w.id = a.subject_id
      left join public.restrictions x on a.kind = 'restriction' and x.id = a.subject_id
     where a.status in ('open', 'recommend-overturn')
       and private.can_handle_appeal(v_uid, a.kind, a.user_id, a.subject_id)
       and (a.status = 'open' or private.creator_unlocked(false))
     order by a.created_at;
end;
$$;

create or replace function public.decide_appeal(p_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_a public.appeals;
  v_log bigint;
  v_creator boolean := false;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null or not private.is_reviewer(v_uid) then raise exception 'Not allowed.'; end if;
  if p_decision not in ('uphold', 'recommend', 'overturn') then raise exception 'Unknown decision.'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'Keep the note under 500 characters.'; end if;
  select * into v_a from public.appeals where id = p_id and status in ('open', 'recommend-overturn') for update;
  if not found then raise exception 'That appeal is already decided.'; end if;
  if not private.can_handle_appeal(v_uid, v_a.kind, v_a.user_id, v_a.subject_id) then raise exception 'You cannot handle this appeal.'; end if;
  v_creator := private.creator_unlocked(true);

  if p_decision = 'recommend' then
    if v_creator then raise exception 'The Creator decides directly.'; end if;
    if v_a.kind = 'other' then raise exception 'Only the Creator handles this kind of appeal.'; end if;
    update public.appeals set status = 'recommend-overturn', decided_by = v_uid, decided_role = private.top_reviewer_role(v_uid), decided_at = now(), decision_note = v_note where id = p_id;
    perform private.log_activity(v_uid, 'appeal-decided', 'user', v_a.user_id, v_a.user_id, null, jsonb_build_object('appeal_id', p_id, 'decision', 'recommend'));
    return;
  end if;

  if p_decision = 'overturn' then
    if not v_creator then raise exception 'Only the Creator can overturn a decision.'; end if;
    if v_a.kind = 'warning' then
      select l.id into v_log from public.activity_log l
       where l.action = 'warn' and (l.details ->> 'warning_id') = v_a.subject_id::text
         and not exists (select 1 from public.activity_log u where u.undoes = l.id)
       order by l.id desc limit 1;
      if v_log is null then raise exception 'That warning was already undone.'; end if;
      perform public.undo_activity(v_log);
    elsif v_a.kind = 'restriction' then
      update public.restrictions set lifted_at = now(), lifted_reason = 'Appeal accepted by the Creator' where id = v_a.subject_id and lifted_at is null;
      insert into public.notifications (user_id, body, kind, data) values (v_a.user_id, 'Your restriction was lifted.', 'restriction-lifted', '{}'::jsonb);
    end if;
  elsif not (v_creator or private.is_reviewer(v_uid)) then
    raise exception 'Not allowed.';
  end if;

  update public.appeals
     set status = case p_decision when 'overturn' then 'overturned' else 'upheld' end,
         decided_by = v_uid, decided_role = private.top_reviewer_role(v_uid), decided_at = now(), decision_note = v_note
   where id = p_id;
  insert into public.notifications (user_id, body, kind, data)
  values (v_a.user_id,
          case p_decision when 'overturn' then 'Your appeal was accepted.' else 'Your appeal was reviewed and the decision stands.' end
            || coalesce(' ' || v_note, ''),
          'appeal-decided', jsonb_build_object('appeal_id', p_id, 'decision', p_decision));
  perform private.log_activity(v_uid, 'appeal-decided', 'user', v_a.user_id, v_a.user_id, null, jsonb_build_object('appeal_id', p_id, 'decision', p_decision));
end;
$$;

-- ============================================================================
-- "Download my data" (Step 8). Everything the hub holds about the signed-in
-- member, put together when they ask and never stored. Leaves out secrets
-- (the member's AI key), the identity of any reviewer, other people's
-- personal data, and the storage addresses of files.
-- ============================================================================
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  return jsonb_build_object(
    'about', 'Everything AOEhub holds about your account, put together when you asked. Your AI key is never included. Files you uploaded are not in this file (you already have them); their names and sizes are.',
    'made_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at) from auth.users u where u.id = v_uid),
    'profile', (select to_jsonb(p) - 'account_status_by' - 'avatar_path' from public.profiles p where p.id = v_uid),
    'has_profile_picture', (select avatar_path is not null from public.profiles where id = v_uid),
    'roles', coalesce((select jsonb_agg(r.role) from public.user_roles r where r.user_id = v_uid), '[]'::jsonb),
    'terms_accepted', coalesce((select jsonb_agg(to_jsonb(t)) from public.terms_acceptances t where t.user_id = v_uid), '[]'::jsonb),
    'experience_posts', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'category', e.category, 'title', e.title, 'body', e.body, 'made_with_ai', e.made_with_ai, 'views', e.views, 'created_at', e.created_at, 'deleted_at', e.deleted_at) order by e.created_at) from public.experience_posts e where e.author_id = v_uid), '[]'::jsonb),
    'file_posts', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'description', f.description, 'section', f.section, 'media_type', f.media_type, 'authorship', f.authorship, 'made_with_ai', f.made_with_ai, 'views', f.views, 'created_at', f.created_at, 'deleted_at', f.deleted_at,
        'files', coalesce((select jsonb_agg(jsonb_build_object('label', a.label, 'type', a.mime_type, 'size_bytes', a.size_bytes, 'downloads', a.downloads, 'link', a.link_url, 'is_game', a.is_game)) from public.file_assets a where a.file_post_id = f.id), '[]'::jsonb)) order by f.created_at) from public.file_posts f where f.author_id = v_uid), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'on', c.parent_type, 'on_id', c.parent_id, 'type', c.type, 'body', c.body, 'created_at', c.created_at, 'deleted_at', c.deleted_at) order by c.created_at) from public.comments c where c.author_id = v_uid), '[]'::jsonb),
    'previews', coalesce((select jsonb_agg(jsonb_build_object('kind', m.kind, 'size_bytes', m.size_bytes, 'on', m.owner_type, 'on_id', m.owner_id, 'created_at', m.created_at)) from public.post_media m
                           where (m.owner_type = 'file' and exists (select 1 from public.file_posts f where f.id = m.owner_id and f.author_id = v_uid))
                              or (m.owner_type = 'experience' and exists (select 1 from public.experience_posts e where e.id = m.owner_id and e.author_id = v_uid))), '[]'::jsonb),
    'following', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(p.display_name, ''), p.name), 'since', fo.created_at)) from public.follows fo join public.profiles p on p.id = fo.followee_id where fo.follower_id = v_uid), '[]'::jsonb),
    'followers_count', (select count(*) from public.follows where followee_id = v_uid),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'kind', n.kind, 'read', n.read, 'created_at', n.created_at) order by n.created_at) from public.notifications n where n.user_id = v_uid), '[]'::jsonb),
    'warnings', coalesce((select jsonb_agg(jsonb_build_object('reason', w.reason_code, 'level', w.level, 'item_kind', w.item_kind, 'content_at_the_time', w.snapshot, 'created_at', w.created_at, 'withdrawn_at', w.undone_at) order by w.created_at) from public.warnings w where w.user_id = v_uid), '[]'::jsonb),
    'restrictions', coalesce((select jsonb_agg(jsonb_build_object('started_at', x.started_at, 'ends_at', x.ends_at, 'lifted_at', x.lifted_at) order by x.started_at) from public.restrictions x where x.user_id = v_uid), '[]'::jsonb),
    'appeals', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'message', a.message, 'status', a.status, 'answer_note', a.decision_note, 'created_at', a.created_at, 'decided_at', a.decided_at) order by a.created_at) from public.appeals a where a.user_id = v_uid), '[]'::jsonb),
    'reports_you_sent', coalesce((select jsonb_agg(jsonb_build_object('about', r.target_type, 'reason', r.reason, 'details', r.details, 'urgent', r.urgent, 'status', r.status, 'created_at', r.created_at) order by r.created_at) from public.reports r where r.reported_by = v_uid), '[]'::jsonb),
    'link_site_requests', coalesce((select jsonb_agg(jsonb_build_object('site', q.host, 'note', q.note, 'status', q.status, 'created_at', q.created_at)) from public.link_host_requests q where q.user_id = v_uid), '[]'::jsonb),
    'pinned', coalesce((select jsonb_agg(jsonb_build_object('board', vp.board, 'item_id', vp.item_id, 'pinned_at', vp.pinned_at)) from public.verified_pins vp where vp.user_id = v_uid), '[]'::jsonb),
    'ai_settings', (select jsonb_build_object('provider', s.provider, 'model', s.model, 'key_saved', true, 'updated_at', s.updated_at) from public.user_ai_settings s where s.user_id = v_uid),
    'uploads_last_30_days', coalesce((select jsonb_agg(jsonb_build_object('day', uu.day, 'files', uu.files, 'bytes', uu.bytes) order by uu.day) from public.upload_usage uu where uu.user_id = v_uid and uu.day > current_date - 30), '[]'::jsonb)
  );
end;
$$;

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
-- function by default, so (a) the earlier column revokes did nothing — a
-- member could set their own counters; and (b) server-only functions were
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
revoke insert, update, delete on public.takedown_notices, public.appeals from anon, authenticated;
revoke insert, update, delete on public.post_media from anon, authenticated;
revoke insert, update, delete, truncate on public.ai_key_help from anon, authenticated;
revoke all on public.hub_settings, public.creator_access, public.creator_sessions, public.creator_recovery_keys, public.creator_security_events from anon, authenticated;
revoke all on public.restrictions from anon;

-- profiles: only the person's own presentation fields. Counters,
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

grant insert (target_type, target_id, reason, details, reported_by, urgent) on public.reports to authenticated;

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
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.my_standing() to authenticated;
grant execute on function public.file_appeal(text, uuid, text) to authenticated;
grant execute on function public.list_appeals() to authenticated;
grant execute on function public.decide_appeal(uuid, text, text) to authenticated;
grant execute on function public.remove_profile_picture(uuid, uuid) to authenticated;
grant execute on function public.add_link_host(text, text) to authenticated;
grant execute on function public.remove_link_host(text) to authenticated;
grant execute on function public.resolve_link_host_request(uuid, boolean) to authenticated;
grant execute on function public.add_hub_ai_key(text, text, text) to authenticated;
grant execute on function public.set_hub_ai_key_active(uuid, boolean) to authenticated;
grant execute on function public.remove_hub_ai_key(uuid) to authenticated;
grant execute on function public.list_hub_ai_keys() to authenticated;
grant execute on function public.set_member_upload_limit(uuid, integer, bigint) to authenticated;
grant execute on function public.set_member_one_time_max(uuid, bigint) to authenticated;
grant execute on function public.my_two_step_status() to authenticated;
grant execute on function public.set_ai_key_help(text, text[], text, boolean) to authenticated;
grant execute on function public.list_ai_key_help() to authenticated;
grant execute on function public.ask_for_two_step(uuid) to authenticated;
grant execute on function public.pin_my_item(text, uuid) to authenticated;
grant execute on function public.unpin_my_item(text) to authenticated;
grant execute on function public.creator_account_queue() to authenticated;
-- list_expired_storage, purge_expired, get_upload_max_file, consume_one_time_max, claim_scan: server (service role) only.
-- record_view, record_download, record_account_deletion,
-- get_user_ai_key, match_kb_chunks: server (service role) only.

-- ============================================================================
-- Sign-up records acceptance of ALL six policy documents (Terms, Content,
-- Community, Safety, Copyright, Privacy). For databases created before
-- "community" and "copyright" existed: widen the allowed kinds and add the
-- draft versions. (A fresh database already has them from the table above.)
-- When the final texts are ready, add version '1.0' rows here the same way.
-- ============================================================================
alter table public.terms_versions drop constraint if exists terms_versions_kind_check;
alter table public.terms_versions add constraint terms_versions_kind_check
  check (kind in ('terms', 'content-policy', 'safety-policy', 'privacy', 'community', 'copyright'));
insert into public.terms_versions (kind, version, scope, summary) values
  ('privacy',   'draft-1', 'hub', 'Placeholder until the final Privacy Policy text is approved.'),
  ('community', 'draft-1', 'hub', 'Placeholder until the final Community Policy text is approved.'),
  ('copyright', 'draft-1', 'hub', 'Placeholder until the final Copyright and Takedown Policy text is approved.')
on conflict (kind, version) do nothing;

-- Reason names reworded 2026-10-31 (the Content Policy does not allow
-- removal for "wrong ideas" or "harmful ideology"); r7 wording is in the app.
update public.moderation_reasons set label = 'Harmful content (as defined in the Terms and Conditions)' where code = 'harmful';
update public.moderation_reasons set label = 'Breaks a rule in the Terms and Conditions',
  note = 'Renamed 2026-10-31: the Terms and Conditions do not allow removal for "wrong ideas".' where code = 'wrong-ideas';
update public.moderation_reasons set label = 'Something else that worries me (please explain)' where code = 'other';

-- ============================================================================
-- Buzzora Board (news, law and regulation about homeschooling and
-- unschooling) and "Videos" picks (links to videos on other platforms).
--
-- Both live in experience_posts so comments, reports, review, trash, restore,
-- translation and the "Show original" switch all work with no extra code.
--   board 'experience' (default) = the AOE Experience Board
--   board 'buzzora'              = the Buzzora Board
-- Posts are written by the AOEhub system account (see src/lib/buzzora/system-user.ts):
-- by the daily AI jobs, or by the Creator / a Watcher through the staff routes.
-- Only those can create such posts; members cannot, even by calling the database directly.
-- ============================================================================
alter table public.experience_posts add column if not exists board text not null default 'experience';
alter table public.experience_posts add column if not exists buzz_kind text;
alter table public.experience_posts add column if not exists country text;
alter table public.experience_posts add column if not exists sources jsonb;
alter table public.experience_posts add column if not exists is_ai boolean not null default false;
alter table public.experience_posts add column if not exists link_url text;
alter table public.experience_posts add column if not exists link_platform text;
alter table public.experience_posts add column if not exists posted_by uuid;

alter table public.experience_posts drop constraint if exists experience_posts_board_check;
alter table public.experience_posts add constraint experience_posts_board_check check (board in ('experience', 'buzzora'));
alter table public.experience_posts drop constraint if exists experience_posts_buzz_kind_check;
alter table public.experience_posts add constraint experience_posts_buzz_kind_check check (buzz_kind is null or buzz_kind in ('news', 'law', 'regulation'));
alter table public.experience_posts drop constraint if exists experience_posts_link_platform_check;
alter table public.experience_posts add constraint experience_posts_link_platform_check
  check (link_platform is null or link_platform in ('youtube', 'bilibili', 'tiktok', 'xiaohongshu', 'wechat', 'facebook'));
alter table public.experience_posts drop constraint if exists experience_posts_category_check;
alter table public.experience_posts add constraint experience_posts_category_check
  check (category in ('philosophy', 'starting-out', 'milestones', 'struggles', 'curriculum-reviews', 'reflections', 'just-sharing', 'question', 'videos'));

create index if not exists experience_posts_board_idx on public.experience_posts (board, created_at desc);
create unique index if not exists experience_posts_link_url_uniq on public.experience_posts (link_url) where link_url is not null;

-- Only the Creator and Watchers (or the server's own jobs, which have no signed-in user and
-- check the role themselves) may create Buzzora posts, Videos posts, AI posts or posts with
-- links/sources. Changing an existing post is guarded only when it changes those things, so a
-- Deacon can still delete or restore one through the normal review tools.
create or replace function private.guard_curated_posts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curated boolean;
begin
  v_curated := new.board = 'buzzora' or new.category = 'videos' or new.is_ai
               or new.link_url is not null or new.link_platform is not null
               or new.buzz_kind is not null or new.sources is not null;
  if tg_op = 'UPDATE' then
    v_curated := v_curated and (
      new.board is distinct from old.board or new.category is distinct from old.category
      or new.is_ai is distinct from old.is_ai or new.link_url is distinct from old.link_url
      or new.link_platform is distinct from old.link_platform or new.buzz_kind is distinct from old.buzz_kind
      or new.sources is distinct from old.sources
    );
  end if;
  if v_curated and auth.uid() is not null
     and not (private.has_role(auth.uid(), 'creator') or private.has_role(auth.uid(), 'watcher')) then
    raise exception 'Only the Creator and Watchers can post here.';
  end if;
  return new;
end;
$$;

drop trigger if exists experience_posts_guard_curated on public.experience_posts;
create trigger experience_posts_guard_curated
  before insert or update on public.experience_posts
  for each row execute function private.guard_curated_posts();

-- Links the daily jobs have already looked at (so the same article is not judged twice).
-- Server only: no one signed in can read or write it.
create table if not exists public.buzz_seen_urls (
  url_hash text primary key,
  url text not null,
  verdict text not null,
  seen_at timestamptz not null default now()
);
alter table public.buzz_seen_urls enable row level security;
revoke all on public.buzz_seen_urls from anon, authenticated;
create index if not exists buzz_seen_urls_seen_at_idx on public.buzz_seen_urls (seen_at);

-- Daily limits and switches (the Creator can change them in hub_settings without a deploy).
insert into public.hub_settings (key, value) values
  ('buzzora_enabled', 'true'::jsonb),
  ('buzzora_daily_cap', '3'::jsonb),
  ('video_picks_enabled', 'true'::jsonb),
  ('video_picks_daily_cap', '3'::jsonb)
on conflict (key) do nothing;

-- ============================================================================
-- Daily automatic policy check (decided by Clara, 2026-11-17).
-- Once a day the AI reads NEW posts and comments and, when it thinks one
-- breaks the Terms and Conditions, files an ordinary report (no reporter:
-- the details start with "AOEhub auto-check"). It never deletes, hides or
-- warns. Each item is checked only once, so an item whose report was
-- dismissed is never reported by the auto-check again.
-- ============================================================================
create table if not exists public.auto_checks (
  item_type text not null check (item_type in ('experience-post', 'comment')),
  item_id uuid not null,
  flagged boolean not null default false,
  checked_at timestamptz not null default now(),
  primary key (item_type, item_id)
);
alter table public.auto_checks enable row level security;
revoke all on public.auto_checks from anon, authenticated;

insert into public.hub_settings (key, value) values
  ('auto_check_enabled', 'true'::jsonb),
  ('auto_check_daily_cap', '200'::jsonb)
on conflict (key) do nothing;
