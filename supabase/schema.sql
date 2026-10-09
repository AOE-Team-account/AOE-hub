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
  is_admin boolean not null default false,
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
  if not public.is_admin(auth.uid()) then
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

-- profiles: readable by everyone (public profile pages); only the owner
-- can update their own row (points/admin/counters are function/trigger
-- managed, not client-writable — see the column grants below).
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable" on public.profiles
  for select using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke update (points, is_admin, followers_count, following_count, files_count, member_since)
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

-- Per project memory: "flagged files get quarantined automatically, never
-- shown publicly." Only clean assets are visible to everyone; the
-- uploader can still see their own pending/flagged assets (so they get
-- feedback on what happened), and admins can see everything for moderation.
drop policy if exists "clean file assets are publicly readable" on public.file_assets;
create policy "clean file assets are publicly readable" on public.file_assets
  for select using (
    scan_status = 'clean'
    or exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid())
    or public.is_admin(auth.uid())
  );

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

-- Comments: everything on the hub is public (Groups, the only private space,
-- was removed), so comments on files and posts are readable by everyone.
drop policy if exists "comments are readable per parent visibility" on public.comments;
drop policy if exists "comments are publicly readable" on public.comments;
create policy "comments are publicly readable" on public.comments
  for select using (true);

drop policy if exists "signed-in users can comment" on public.comments;
create policy "signed-in users can comment" on public.comments
  for insert with check (
    auth.uid() = author_id
    and parent_type in ('file', 'experience-post')
  );

drop policy if exists "authors and admins can delete comments" on public.comments;
create policy "authors and admins can delete comments" on public.comments
  for delete using (auth.uid() = author_id or public.is_admin(auth.uid()));

-- Nothing calls these any more (the comment policies above were the last
-- users), so they can finally go. Must stay below those policies.
drop function if exists public.is_group_member(uuid, uuid);
drop function if exists public.group_member_count(uuid);

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
  for select using (auth.uid() = asker_id or public.is_admin(auth.uid()));

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
  if not public.is_admin(auth.uid()) then
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
  if not public.is_admin(auth.uid()) then
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
