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
--  - File Board + Experience Board earn points; Groups (public or private)
--    never do — enforced by simply never calling award_points() for group
--    activity.
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
  is_admin boolean not null default false,
  member_since timestamptz not null default now(),
  points integer not null default 0,
  followers_count integer not null default 0,
  following_count integer not null default 0,
  files_count integer not null default 0,
  groups_count integer not null default 0,
  onboarding_experience text check (onboarding_experience in ('new', 'some', 'years')),
  onboarding_reason text check (onboarding_reason in ('curriculum', 'community', 'philosophy', 'notsure')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data. Row is created automatically on signup by handle_new_user().';
comment on column public.profiles.points is 'Honest sum of points_events for this user — only award_points() may change this.';

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

create index if not exists file_assets_file_post_id_idx on public.file_assets (file_post_id);

comment on column public.file_assets.scan_status is 'Malware scan gate (ClamAV/VirusTotal, Phase 3) — only "clean" assets are ever downloadable.';

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
  if new.is_announcement and not exists (
    select 1 from public.profiles where id = new.author_id and is_admin
  ) then
    raise exception 'Only admins may post announcements';
  end if;
  return new;
end;
$$;

drop trigger if exists experience_posts_announcement_check on public.experience_posts;
create trigger experience_posts_announcement_check
  before insert or update on public.experience_posts
  for each row execute function public.announcement_author_must_be_admin();

-- ============================================================================
-- Comments — shared by File Board, Experience Board, and Group discussions
-- ============================================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('file', 'experience-post', 'group')),
  parent_id uuid not null,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('question', 'suggestion', 'sharing')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_parent_idx on public.comments (parent_type, parent_id);

-- ============================================================================
-- Groups
-- ============================================================================

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  visibility text not null check (visibility in ('public', 'private')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  reported boolean not null default false,
  created_at timestamptz not null default now()
);

-- Eligibility to create a group (memory doc: 500+ points, 90+ day old
-- account, no unresolved reports) — enforced structurally, not just in the
-- client UI, same pattern as the authorship field on file uploads.
create or replace function public.creator_must_be_eligible_for_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator public.profiles%rowtype;
  has_unresolved_report boolean;
begin
  select * into creator from public.profiles where id = new.created_by;

  if creator.is_admin then
    return new; -- admins bypass the eligibility gate
  end if;

  if creator.points < 500 then
    raise exception 'Creating a group requires 500+ points (you have %)', creator.points;
  end if;

  if creator.member_since > now() - interval '90 days' then
    raise exception 'Creating a group requires an account older than 90 days';
  end if;

  select exists (
    select 1 from public.reports
    where target_type = 'user' and target_id = new.created_by and status = 'open'
  ) into has_unresolved_report;

  if has_unresolved_report then
    raise exception 'Creating a group requires no unresolved reports against your account';
  end if;

  return new;
end;
$$;

drop trigger if exists groups_eligibility_check on public.groups;
create trigger groups_eligibility_check
  before insert on public.groups
  for each row execute function public.creator_must_be_eligible_for_group();

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- A group's creator is always its first member — structural, so no client
-- code path can forget to add them.
create or replace function public.add_creator_as_group_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id) values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists groups_add_creator_as_member on public.groups;
create trigger groups_add_creator_as_member
  after insert on public.groups
  for each row execute function public.add_creator_as_group_member();

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  used_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- ============================================================================
-- Reports
-- ============================================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('file', 'experience-post', 'comment', 'group', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('scam', 'off-topic', 'inappropriate', 'paywalled', 'copyright', 'other')),
  details text,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'dismissed', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status);

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
  -- Group discussions never earn points (memory doc: Groups are outside
  -- the points system entirely).
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

-- 1536 matches OpenAI's text-embedding-3-small / ada-002 dimensionality —
-- the most common default. If Phase 6 picks a different embedding model,
-- this column's dimension will need to change to match.
create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists kb_chunks_embedding_idx on public.kb_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.file_posts enable row level security;
alter table public.file_assets enable row level security;
alter table public.experience_posts enable row level security;
alter table public.comments enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.reports enable row level security;
alter table public.points_events enable row level security;
alter table public.post_views enable row level security;
alter table public.notifications enable row level security;
alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;

-- Small helper used by several policies below.
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = p_user_id), false);
$$;

create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id
  );
$$;

-- The group_members SELECT policy below (correctly) restricts reading the
-- actual roster to members + admins, so anyone else fetching a *public*
-- group's row would otherwise see its member count as 0. A count alone
-- isn't sensitive (the app already shows it on public group cards), and
-- this is only ever called for a group row the caller could already see
-- (RLS on `groups` already gated that), so bypassing RLS here to return
-- just a number is safe.
create or replace function public.group_member_count(p_group_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.group_members where group_id = p_group_id;
$$;

-- profiles: readable by everyone (public profile pages); only the owner
-- can update their own row (points/admin/counters are function/trigger
-- managed, not client-writable — see the column grants below).
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable" on public.profiles
  for select using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke update (points, is_admin, followers_count, following_count, files_count, groups_count, member_since)
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
create policy "file posts are publicly readable" on public.file_posts for select using (true);

drop policy if exists "signed-in users can post files" on public.file_posts;
create policy "signed-in users can post files" on public.file_posts
  for insert with check (auth.uid() = author_id);

drop policy if exists "authors and admins can update file posts" on public.file_posts;
create policy "authors and admins can update file posts" on public.file_posts
  for update using (auth.uid() = author_id or public.is_admin(auth.uid()));

drop policy if exists "authors and admins can delete file posts" on public.file_posts;
create policy "authors and admins can delete file posts" on public.file_posts
  for delete using (auth.uid() = author_id or public.is_admin(auth.uid()));

drop policy if exists "file assets are publicly readable" on public.file_assets;
create policy "file assets are publicly readable" on public.file_assets for select using (true);

drop policy if exists "post authors manage their file assets" on public.file_assets;
create policy "post authors manage their file assets" on public.file_assets
  for all using (
    exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid())
    or public.is_admin(auth.uid())
  );

-- Experience Board: same public-read / authed-write shape. The
-- announcement_author_must_be_admin trigger (above) is the real guard on
-- is_announcement; this policy just gates writes to signed-in users.
drop policy if exists "experience posts are publicly readable" on public.experience_posts;
create policy "experience posts are publicly readable" on public.experience_posts for select using (true);

drop policy if exists "signed-in users can post experiences" on public.experience_posts;
create policy "signed-in users can post experiences" on public.experience_posts
  for insert with check (auth.uid() = author_id);

drop policy if exists "authors and admins can update experience posts" on public.experience_posts;
create policy "authors and admins can update experience posts" on public.experience_posts
  for update using (auth.uid() = author_id or public.is_admin(auth.uid()));

drop policy if exists "authors and admins can delete experience posts" on public.experience_posts;
create policy "authors and admins can delete experience posts" on public.experience_posts
  for delete using (auth.uid() = author_id or public.is_admin(auth.uid()));

-- Comments: public for file/experience parents; for group-parented
-- comments, only members (or admins) can read — private groups stay
-- private from other members, per the memory doc, though always visible
-- to admins for moderation.
drop policy if exists "comments are readable per parent visibility" on public.comments;
create policy "comments are readable per parent visibility" on public.comments
  for select using (
    parent_type in ('file', 'experience-post')
    or (parent_type = 'group' and (public.is_group_member(parent_id, auth.uid()) or public.is_admin(auth.uid())))
  );

drop policy if exists "signed-in users can comment" on public.comments;
create policy "signed-in users can comment" on public.comments
  for insert with check (
    auth.uid() = author_id
    and (
      parent_type in ('file', 'experience-post')
      or (parent_type = 'group' and public.is_group_member(parent_id, auth.uid()))
    )
  );

drop policy if exists "authors and admins can delete comments" on public.comments;
create policy "authors and admins can delete comments" on public.comments
  for delete using (auth.uid() = author_id or public.is_admin(auth.uid()));

-- Groups: public groups are listable by everyone; private groups are
-- visible only to members and admins ("private" means private from other
-- members, not from the platform).
drop policy if exists "groups are visible per visibility rules" on public.groups;
create policy "groups are visible per visibility rules" on public.groups
  for select using (
    visibility = 'public'
    or public.is_group_member(id, auth.uid())
    or public.is_admin(auth.uid())
  );

drop policy if exists "signed-in users can create groups" on public.groups;
create policy "signed-in users can create groups" on public.groups
  for insert with check (auth.uid() = created_by);

drop policy if exists "creators and admins can update groups" on public.groups;
create policy "creators and admins can update groups" on public.groups
  for update using (auth.uid() = created_by or public.is_admin(auth.uid()));

drop policy if exists "creators and admins can delete groups" on public.groups;
create policy "creators and admins can delete groups" on public.groups
  for delete using (auth.uid() = created_by or public.is_admin(auth.uid()));

-- group_members: members of a group (+ admins) can see its roster; users
-- manage their own membership row (join/leave).
drop policy if exists "group rosters visible to members and admins" on public.group_members;
create policy "group rosters visible to members and admins" on public.group_members
  for select using (public.is_group_member(group_id, auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists "users manage their own membership" on public.group_members;
create policy "users manage their own membership" on public.group_members
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- group_invites: only group members can create invites; only the invited
-- flow (matching by code) or an admin can read one.
drop policy if exists "members create invites" on public.group_invites;
create policy "members create invites" on public.group_invites
  for insert with check (public.is_group_member(group_id, auth.uid()));

drop policy if exists "invite creators and admins can view invites" on public.group_invites;
create policy "invite creators and admins can view invites" on public.group_invites
  for select using (auth.uid() = created_by or public.is_admin(auth.uid()));

-- Reports: anyone signed in can file one; only admins can read/manage the
-- queue (the admin dashboard's whole reason for existing).
drop policy if exists "signed-in users can file reports" on public.reports;
create policy "signed-in users can file reports" on public.reports
  for insert with check (auth.uid() = reported_by);

drop policy if exists "admins manage reports" on public.reports;
create policy "admins manage reports" on public.reports
  for select using (public.is_admin(auth.uid()));

drop policy if exists "admins update reports" on public.reports;
create policy "admins update reports" on public.reports
  for update using (public.is_admin(auth.uid()));

-- points_events: written only by award_points() (SECURITY DEFINER, runs as
-- the function owner, bypassing RLS) — no direct client insert policy on
-- purpose. Readable by the point recipient (for "how points work"
-- transparency) and admins.
drop policy if exists "users see their own points history" on public.points_events;
create policy "users see their own points history" on public.points_events
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

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
