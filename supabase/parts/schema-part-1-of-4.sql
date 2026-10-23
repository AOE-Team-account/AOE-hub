-- AOEhub database setup, part 1 of 4. Run the parts in order (1, 2, 3 ...). Each part is safe to run again.

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
  ('harmful',          'Harmful ideology or harmful content',               'red',    '{delete,warn,suspend}', 20, null),
  ('inappropriate',    'Inappropriate content',                             'red',    '{delete,warn,suspend}', 30, 'Level assumed (memory doc chat6).'),
  ('child-safety',     'Child-safety concern',                              'red',    '{delete,warn,suspend}', 35, 'Added at Clara''s request 2026-10-11 (emergency suspension).'),
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

