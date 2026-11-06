
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
