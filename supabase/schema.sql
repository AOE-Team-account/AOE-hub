-- AOEhub — Phase 2 database schema
--
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New
-- query → paste this whole file → Run) on a freshly created project.
-- It is written to be safe to re-run (IF NOT EXISTS everywhere it can be).
--
-- Design notes (see "AOEhub memory from chat.md" for the full rationale):
--  - profiles.points is a denormalized honest sum, maintained only by the
--    award_points() function below — never written to directly by clients.
--  - Search-ranking compression (log-scale) happens in application code
--    (src/lib/points.ts), not here — the DB only stores raw point events.
--  - Only File Board + Experience Board activity earns points.
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
  points integer not null default 0,
  followers_count integer not null default 0,
  following_count integer not null default 0,
  files_count integer not null default 0,
  onboarding_experience text check (onboarding_experience in ('homeschooling', 'in-school', 'unschooling', 'want-to-know-more', 'new-way-of-learning')),
  onboarding_reason text check (onboarding_reason in ('curriculum', 'community', 'philosophy', 'notsure')),
  referral_source text check (referral_source is null or referral_source in ('friend', 'web-search', 'social-media', 'youtube', 'other')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data. Row is created automatically on signup by handle_new_user().';
comment on column public.profiles.points is 'Honest sum of points_events for this user — only award_points() may change this.';

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

-- Legacy meaning of "admin" (the old is_admin flag): Creator or Watcher.
-- Only still used by the admin inbox and the admin dashboard, which the new
-- panels replace. New code uses reviewer_can() / has_role() instead.
create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = p_user_id and role in ('creator', 'watcher'));
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
  ('scam',             'Scam or asking for money',                          'red',    '{delete,warn}', 10, null),
  ('harmful',          'Harmful ideology or harmful content',               'red',    '{delete,warn}', 20, null),
  ('inappropriate',    'Inappropriate content',                             'red',    '{delete,warn}', 30, 'Level assumed (memory doc chat6).'),
  ('wrong-ideas',      'Wrong ideas (as defined in the content policy)',    'yellow', '{delete,warn}', 40, 'Wording to be defined in the content policy before launch.'),
  ('ads',              'Ads or self-promotion',                             'yellow', '{delete,warn}', 50, null),
  ('paywalled',        'Paywalled or costs money',                          'yellow', '{delete,warn}', 60, 'Level assumed (memory doc chat6).'),
  ('copyright',        'Copyright — not their work',                        'yellow', '{delete,warn}', 70, 'Level assumed (memory doc chat6).'),
  ('off-topic',        'Off-topic / not education related',                 'green',  '{delete,warn}', 80, null),
  ('other',            'Something else',                                    null,     '{delete}',      90, 'Delete only: a warning needs a reason that sets a level.'),
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
  action text not null check (action in ('view', 'notice', 'warn', 'delete', 'dismiss')),
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

create or replace function private.reviewer_can(p_user_id uuid, p_kind text, p_action text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.user_roles r
      join public.reviewer_permissions p on p.role = r.role
     where r.user_id = p_user_id and p.kind = p_kind and p.action = p_action
  );
$$;

-- Report target types and content kinds are spelled differently.
create or replace function private.report_kind(p_target_type text)
returns text
language sql
immutable
as $$
  select case p_target_type when 'experience-post' then 'post' else p_target_type end;
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
  end;
end;
$$;

grant execute on function private.has_role(uuid, text) to anon, authenticated, service_role;
grant execute on function private.is_reviewer(uuid) to anon, authenticated, service_role;
grant execute on function private.is_admin(uuid) to anon, authenticated, service_role;
grant execute on function private.reviewer_can(uuid, text, text) to anon, authenticated, service_role;
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
  kind text not null check (kind in ('terms', 'content-policy', 'safety-policy', 'privacy')),
  version text not null,
  scope text not null default 'hub' check (scope in ('hub', 'marketplace')),
  published_at timestamptz not null default now(),
  summary text,
  primary key (kind, version)
);

insert into public.terms_versions (kind, version, scope, summary) values
  ('terms',         'draft-1', 'hub', 'Placeholder until the final Terms of Service text is approved.'),
  ('content-policy','draft-1', 'hub', 'Placeholder until the final content policy text is approved.'),
  ('safety-policy', 'draft-1', 'hub', 'Placeholder until the final safety policy text is approved.')
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

comment on column public.file_assets.scan_status is 'Malware scan gate (VirusTotal, Phase 3) — only "clean" assets are ever downloadable.';
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

comment on column public.experience_posts.is_announcement is 'Admin-only pinned announcements — enforced by the announcement_author_must_be_admin trigger below.';

create or replace function public.announcement_author_must_be_admin()
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
  for each row execute function public.announcement_author_must_be_admin();

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
  check (target_type in ('file', 'experience-post', 'comment', 'user'));

drop trigger if exists reports_sync_group_flag on public.reports;
drop function if exists public.sync_group_reported_flag();
drop table if exists public.group_invites;
drop table if exists public.group_members;
drop table if exists public.groups;
drop function if exists public.creator_must_be_eligible_for_group();
drop function if exists public.add_creator_as_group_member();
alter table public.profiles drop column if exists groups_count;

-- Lets an admin notify a member (e.g. a moderation warning) without a client
-- insert policy on notifications — every other write to that table already
-- goes through a SECURITY DEFINER path (award_points, answer_admin_question,
-- handle_new_user), this keeps the same rule for admin-authored ones.
create or replace function public.admin_notify_user(p_user_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Only admins can send this notification.';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception 'Invalid notification text.';
  end if;
  insert into public.notifications (user_id, body, kind) values (p_user_id, btrim(p_body), 'admin-warning');
end;
$$;

revoke execute on function public.admin_notify_user(uuid, text) from public, anon;
grant execute on function public.admin_notify_user(uuid, text) to authenticated;

-- ============================================================================
-- Points — raw event ledger + the one function allowed to change balances
-- ============================================================================

create table if not exists public.points_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  points integer not null,
  kind text not null check (kind in ('view', 'download', 'comment_received', 'remix')),
  target_type text not null,
  target_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists points_events_user_id_idx on public.points_events (user_id);

-- Exact formula from the memory doc: 1/view, 5/download, 3/comment received,
-- 10/remix. SECURITY DEFINER so it can update profiles.points even though
-- clients never get UPDATE on that column directly (see RLS below).
create or replace function public.award_points(
  p_user_id uuid,
  p_points integer,
  p_kind text,
  p_target_type text,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.points_events (user_id, points, kind, target_type, target_id)
  values (p_user_id, p_points, p_kind, p_target_type, p_target_id);

  update public.profiles set points = points + p_points where id = p_user_id;
end;
$$;

-- Dedup table for "1 point per view, rate-limited to once per person per
-- day" — a row here means that viewer already earned the poster a point
-- for that content today.
create table if not exists public.post_views (
  target_type text not null,
  target_id uuid not null,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_on date not null default current_date,
  primary key (target_type, target_id, viewer_id, viewed_on)
);

-- Call this from the app whenever a signed-in user opens a file or
-- experience post. Silently no-ops on a duplicate same-day view or a
-- self-view (you can't earn points from viewing your own content).
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
  author uuid;
  is_new_view_today boolean;
begin
  -- Both the raw view counter AND the point award are gated on this being a
  -- genuinely new view (this viewer, this content, today) — not just the
  -- point award. An earlier version of this function incremented the
  -- counter unconditionally on every call, which would have inflated view
  -- counts on every page load/refresh, not just once per person per day.
  insert into public.post_views (target_type, target_id, viewer_id)
  values (p_target_type, p_target_id, p_viewer_id)
  on conflict do nothing
  returning true into is_new_view_today;

  if not coalesce(is_new_view_today, false) then
    return;
  end if;

  if p_target_type = 'file' then
    select author_id into author from public.file_posts where id = p_target_id;
    update public.file_posts set views = views + 1 where id = p_target_id;
  elsif p_target_type = 'experience-post' then
    select author_id into author from public.experience_posts where id = p_target_id;
    update public.experience_posts set views = views + 1 where id = p_target_id;
  else
    raise exception 'record_view: unsupported target_type %', p_target_type;
  end if;

  if author is not null and author <> p_viewer_id then
    perform public.award_points(author, 1, 'view', p_target_type, p_target_id);
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
  v_file_post_id uuid;
  author uuid;
begin
  update public.file_assets set downloads = downloads + 1
    where id = p_asset_id
    returning file_post_id into v_file_post_id;

  select author_id into author from public.file_posts where id = v_file_post_id;

  if author is not null and author <> p_downloader_id then
    perform public.award_points(author, 5, 'download', 'file', v_file_post_id);
  end if;
end;
$$;

-- Comments and remixes award points via triggers, since those are plain
-- inserts rather than app-invoked RPCs.
create or replace function public.award_points_for_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
begin
  if new.parent_type = 'file' then
    select author_id into post_author from public.file_posts where id = new.parent_id;
  elsif new.parent_type = 'experience-post' then
    select author_id into post_author from public.experience_posts where id = new.parent_id;
  else
    return new;
  end if;

  if post_author is not null and post_author <> new.author_id then
    perform public.award_points(post_author, 3, 'comment_received', new.parent_type, new.parent_id);
  end if;

  return new;
end;
$$;

drop trigger if exists comments_award_points on public.comments;
create trigger comments_award_points
  after insert on public.comments
  for each row execute function public.award_points_for_comment();

create or replace function public.award_points_for_remix()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  original_author uuid;
begin
  if new.remix_of_post_id is not null then
    select author_id into original_author from public.file_posts where id = new.remix_of_post_id;
    if original_author is not null and original_author <> new.author_id then
      perform public.award_points(original_author, 10, 'remix', 'file', new.remix_of_post_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists file_posts_award_remix_points on public.file_posts;
create trigger file_posts_award_remix_points
  after insert on public.file_posts
  for each row execute function public.award_points_for_remix();

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
  source_type text not null check (source_type in ('philosophy-text', 'admin-answer', 'file-post', 'experience-post')),
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
-- Set only once EVERY chunk of the document has been embedded with this
-- model. A long book is indexed in resumable slices; null/other = unfinished.
alter table public.kb_documents add column if not exists indexed_model text;
alter table public.kb_documents drop constraint if exists kb_documents_source_type_check;
alter table public.kb_documents add constraint kb_documents_source_type_check
  check (source_type in ('philosophy-text', 'admin-answer', 'file-post', 'experience-post', 'hub-guide'));
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
alter table public.points_events enable row level security;
alter table public.post_views enable row level security;
alter table public.notifications enable row level security;
alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;

-- profiles: readable by everyone (public profile pages); only the owner
-- can update their own row (points/admin/counters are function/trigger
-- managed, not client-writable — see the column grants below).
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable" on public.profiles
  for select using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke update (points, followers_count, following_count, files_count, member_since)
  on public.profiles from authenticated;

-- follows: readable by everyone; only the follower can create/delete their
-- own follow rows.
drop policy if exists "follows are publicly readable" on public.follows;
create policy "follows are publicly readable" on public.follows for select using (true);

drop policy if exists "users manage their own follows" on public.follows;
create policy "users manage their own follows" on public.follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- File Board: browsing is always free (even logged-out/anon), per the
-- access model. Writes require auth; only the author (or an admin) may
-- update/delete their own posts.
drop policy if exists "file posts are publicly readable" on public.file_posts;
create policy "file posts are publicly readable" on public.file_posts for select using (deleted_at is null);

drop policy if exists "signed-in users can post files" on public.file_posts;
create policy "signed-in users can post files" on public.file_posts
  for insert with check (auth.uid() = author_id);

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
-- feedback on what happened), and admins can see everything for moderation.
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
  );

-- Experience Board: same public-read / authed-write shape. The
-- announcement_author_must_be_admin trigger (above) is the real guard on
-- is_announcement; this policy just gates writes to signed-in users.
drop policy if exists "experience posts are publicly readable" on public.experience_posts;
create policy "experience posts are publicly readable" on public.experience_posts for select using (deleted_at is null);

drop policy if exists "signed-in users can post experiences" on public.experience_posts;
create policy "signed-in users can post experiences" on public.experience_posts
  for insert with check (auth.uid() = author_id);

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
  for select using (deleted_at is null);

drop policy if exists "signed-in users can comment" on public.comments;
create policy "signed-in users can comment" on public.comments
  for insert with check (
    auth.uid() = author_id
    and parent_type in ('file', 'experience-post')
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

-- points_events: written only by award_points() (SECURITY DEFINER, runs as
-- the function owner, bypassing RLS) — no direct client insert policy on
-- purpose. Readable by the point recipient (for "how points work"
-- transparency) and admins.
drop policy if exists "users see their own points history" on public.points_events;
create policy "users see their own points history" on public.points_events
  for select using (auth.uid() = user_id or private.is_admin(auth.uid()));

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

-- When a post is deleted (by its author, an admin, or a cascade from a
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
  where c.embedding_model = p_model
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke execute on function public.match_kb_chunks(vector, integer, text) from public, anon, authenticated;
grant execute on function public.match_kb_chunks(vector, integer, text) to service_role;

-- ---- Questions the AI couldn't answer, routed to the admins ---------------

create table if not exists public.admin_questions (
  id uuid primary key default gen_random_uuid(),
  asker_id uuid not null references public.profiles (id) on delete cascade,
  question text not null check (char_length(question) between 3 and 1000),
  lang text,
  status text not null default 'open' check (status in ('open', 'answered')),
  answer text check (answer is null or char_length(answer) <= 4000),
  answered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists admin_questions_status_idx on public.admin_questions (status, created_at);
alter table public.admin_questions enable row level security;

-- Cap open questions per member so the admin inbox can't be flooded.
create or replace function public.limit_open_admin_questions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.admin_questions where asker_id = new.asker_id and status = 'open') >= 5 then
    raise exception 'You already have 5 open questions with the admins — please wait for an answer first.';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_questions_limit on public.admin_questions;
create trigger admin_questions_limit before insert on public.admin_questions
  for each row execute function public.limit_open_admin_questions();

drop policy if exists "members ask the admins" on public.admin_questions;
create policy "members ask the admins" on public.admin_questions
  for insert with check (auth.uid() = asker_id and status = 'open' and answer is null and answered_by is null);

drop policy if exists "askers and admins read questions" on public.admin_questions;
create policy "askers and admins read questions" on public.admin_questions
  for select using (auth.uid() = asker_id or private.is_admin(auth.uid()));

-- (Defined here, after the admin_questions table exists — creating a trigger
-- on a table that isn't there yet breaks a fresh install.)
-- Same rule for a deleted admin_questions row — this one was missed in the
-- first Phase 5 pass (found 2026-09-24: retracting a wrong answer needs the
-- indexed copy gone too, and this covers any future direct deletion as well).
create or replace function public.remove_kb_document_for_deleted_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents where source_type = 'admin-answer' and source_id = old.id;
  return old;
end;
$$;

drop trigger if exists admin_questions_remove_kb on public.admin_questions;
create trigger admin_questions_remove_kb after delete on public.admin_questions
  for each row execute function public.remove_kb_document_for_deleted_question();

-- Undoes a wrong answer: removes it from the AI's index immediately, reopens
-- the question (so the same "answer" flow can fix it properly), and tells
-- the asker rather than letting an answer silently vanish.
create or replace function public.retract_admin_answer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q public.admin_questions;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Only admins can retract an answer.';
  end if;

  update public.admin_questions
     set status = 'open', answer = null, answered_by = null, answered_at = null
   where id = p_id and status = 'answered'
   returning * into v_q;
  if v_q.id is null then
    raise exception 'That question was not found or has no answer to retract.';
  end if;

  delete from public.kb_documents where source_type = 'admin-answer' and source_id = p_id;

  insert into public.notifications (user_id, body, kind)
  values (v_q.asker_id, 'An admin is revisiting the answer to your question: "' || left(v_q.question, 80) || '" — you''ll hear back again soon.', 'admin-answer-retracted');
end;
$$;

revoke execute on function public.retract_admin_answer(uuid) from public, anon;
grant execute on function public.retract_admin_answer(uuid) to authenticated;

-- Answering goes through this function only: it records the answer, tells the
-- asker, and adds the Q&A to the knowledge base so the AI can answer the same
-- question itself next time (the index run picks up the new document).
create or replace function public.answer_admin_question(p_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q public.admin_questions;
  v_text text;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Only admins can answer questions.';
  end if;
  if p_answer is null or char_length(btrim(p_answer)) not between 1 and 4000 then
    raise exception 'Answer must be between 1 and 4000 characters.';
  end if;

  update public.admin_questions
     set status = 'answered', answer = btrim(p_answer), answered_by = auth.uid(), answered_at = now()
   where id = p_id and status = 'open'
   returning * into v_q;
  if v_q.id is null then
    raise exception 'That question was not found or was already answered.';
  end if;

  insert into public.notifications (user_id, body, kind)
  values (v_q.asker_id, 'An admin answered your question: "' || left(v_q.question, 80) || '" — ' || left(v_q.answer, 200), 'admin-answer');

  v_text := 'Question: ' || v_q.question || E'\nAnswer: ' || v_q.answer;
  insert into public.kb_documents (source_type, source_id, title, content, content_hash)
  values ('admin-answer', v_q.id, left(v_q.question, 120), v_text, md5(v_text))
  on conflict (source_type, source_id) where source_id is not null
  do update set content = excluded.content, content_hash = excluded.content_hash, title = excluded.title;
end;
$$;

revoke execute on function public.answer_admin_question(uuid, text) from public, anon;
grant execute on function public.answer_admin_question(uuid, text) to authenticated;

-- ---- Bring-your-own AI key -------------------------------------------------

-- The key itself is in Vault; this table only remembers which provider/model
-- and which Vault secret. The browser can read its own row (never the key).
create table if not exists public.user_ai_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('google', 'anthropic', 'openai')),
  model text not null check (char_length(model) between 1 and 100),
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now()
);

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
  if p_provider not in ('google', 'anthropic', 'openai') then raise exception 'Unsupported provider.'; end if;
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

-- Creator only: take back a deletion or a dismissed report. Nothing is
-- edited in the log: a new "undo" row points at the original. Changes on one
-- item are undone newest first.
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
begin
  if v_uid is null or not private.has_role(v_uid, 'creator') then
    raise exception 'Only the Creator can undo.';
  end if;

  select * into v_log from public.activity_log where id = p_log_id for update;
  if not found then raise exception 'That entry does not exist.'; end if;
  if v_log.undoes is not null then raise exception 'An undo cannot be undone.'; end if;
  if exists (select 1 from public.activity_log where undoes = p_log_id) then raise exception 'That entry was already undone.'; end if;
  if v_log.action not in ('delete', 'dismiss-report') then raise exception 'That kind of entry cannot be undone yet.'; end if;

  if exists (
    select 1 from public.activity_log n
     where n.id > v_log.id and n.target_kind = v_log.target_kind and n.target_id = v_log.target_id
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

    for v_report_id in select (jsonb_array_elements_text(v_log.details -> 'resolved_reports'))::uuid loop
      update public.reports set status = 'open' where id = v_report_id and status = 'resolved';
    end loop;
  else
    update public.reports set status = 'open' where id = v_log.target_id and status = 'dismissed';
    if not found then raise exception 'The report no longer exists.'; end if;
  end if;

  perform private.log_activity(
    v_uid, 'undo', v_log.target_kind, v_log.target_id, v_log.subject_user_id, v_log.reason_code,
    jsonb_build_object('undid_action', v_log.action), p_log_id
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
  if auth.uid() is null or not private.has_role(auth.uid(), 'creator') then
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
  if auth.uid() is null or not private.has_role(auth.uid(), 'creator') then
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
  if v_uid is null or not private.has_role(v_uid, 'creator') then
    raise exception 'Only the Creator can give roles.';
  end if;
  select * into v_def from public.role_definitions where code = p_role;
  if not found or p_role = 'creator' then raise exception 'That role cannot be given here.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'That person does not exist.'; end if;

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
  if v_uid is null or not private.has_role(v_uid, 'creator') then
    raise exception 'Only the Creator can take roles away.';
  end if;
  select * into v_def from public.role_definitions where code = p_role;
  if not found or p_role = 'creator' then raise exception 'That role cannot be removed here.'; end if;

  delete from public.user_roles where user_id = p_user_id and role = p_role;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;

  perform private.log_activity(v_uid, 'role-revoked', 'user', p_user_id, p_user_id, null, jsonb_build_object('role', p_role));
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id, format('The Creator has removed your %s role. Your account stays as it is.', v_def.label),
          'role-revoked', jsonb_build_object('role', p_role));
end;
$$;

-- Called by the server (service role) just before the Creator deletes an
-- account, so the deletion is in the activity log with a snapshot of the
-- profile. The log keeps no link to the account, so it survives the deletion.
create or replace function public.record_account_deletion(p_actor uuid, p_subject uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.log_activity(
    p_actor, 'delete-account', 'user', p_subject, p_subject, null,
    jsonb_build_object('profile', (select to_jsonb(p) from public.profiles p where p.id = p_subject))
  );
end;
$$;
revoke execute on function public.record_account_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_account_deletion(uuid, uuid) to service_role;

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
revoke execute on function public.undo_activity(bigint) from public, anon;
revoke execute on function public.restore_item(text, uuid) from public, anon;
revoke execute on function public.list_trash() from public, anon;
revoke execute on function public.grant_role(uuid, text) from public, anon;
revoke execute on function public.revoke_role(uuid, text) from public, anon;
revoke execute on function public.accept_terms(text, text) from public, anon;
revoke execute on function public.pending_terms(text) from public, anon;
grant execute on function public.soft_delete_item(text, uuid, text) to authenticated;
grant execute on function public.dismiss_report(uuid, text) to authenticated;
grant execute on function public.undo_activity(bigint) to authenticated;
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
