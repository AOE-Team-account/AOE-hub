-- Minimal stand-ins for the parts of Supabase the block depends on.
create schema if not exists auth; create schema if not exists private;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.user_roles (user_id uuid, role text);
create or replace function private.has_role(p_user_id uuid, p_role text) returns boolean language sql security definer as $$ select exists (select 1 from public.user_roles where user_id = p_user_id and role = p_role) $$;
create table public.hub_settings (key text primary key, value jsonb not null, updated_at timestamptz default now(), updated_by uuid);
create table public.experience_posts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null,
  category text check (category in ('philosophy','starting-out','milestones','struggles','curriculum-reviews','reflections','just-sharing','question')),
  title text, body text not null, views integer not null default 0, pinned boolean not null default false,
  is_announcement boolean not null default false, created_at timestamptz not null default now(), deleted_at timestamptz, deleted_by uuid, deleted_reason text);
create role authenticated; create role anon;
\i /work/buzzora-block.sql
-- run it a SECOND time: it must be safe to re-run
\i /work/buzzora-block.sql
\echo ==== TESTS
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','watcher'), ('00000000-0000-0000-0000-00000000000b','deacon');
create temp table results(name text, ok boolean);
create or replace function pg_temp.attempt(p_name text, p_uid text, p_sql text, p_should_work boolean) returns void language plpgsql as $$
declare v_ok boolean;
begin
  perform set_config('test.uid', p_uid, false);
  begin execute p_sql; v_ok := true; exception when others then v_ok := false; end;
  insert into results values (p_name, v_ok = p_should_work);
end $$;
-- a plain member (uid c) cannot create curated posts, even through the database directly
select pg_temp.attempt('member: plain post works', '00000000-0000-0000-0000-00000000000c', $$insert into public.experience_posts (author_id, category, title, body) values ('00000000-0000-0000-0000-00000000000c','just-sharing','hi','x')$$, true);
select pg_temp.attempt('member: cannot post to buzzora', '00000000-0000-0000-0000-00000000000c', $$insert into public.experience_posts (author_id, board, title, body) values ('00000000-0000-0000-0000-00000000000c','buzzora','t','x')$$, false);
select pg_temp.attempt('member: cannot use Videos tag', '00000000-0000-0000-0000-00000000000c', $$insert into public.experience_posts (author_id, category, title, body) values ('00000000-0000-0000-0000-00000000000c','videos','t','x')$$, false);
select pg_temp.attempt('member: cannot add a link', '00000000-0000-0000-0000-00000000000c', $$insert into public.experience_posts (author_id, link_url, link_platform, title, body) values ('00000000-0000-0000-0000-00000000000c','https://youtu.be/a','youtube','t','x')$$, false);
select pg_temp.attempt('member: cannot claim AI post', '00000000-0000-0000-0000-00000000000c', $$insert into public.experience_posts (author_id, is_ai, title, body) values ('00000000-0000-0000-0000-00000000000c',true,'t','x')$$, false);
select pg_temp.attempt('deacon: cannot post to buzzora', '00000000-0000-0000-0000-00000000000b', $$insert into public.experience_posts (author_id, board, title, body) values ('00000000-0000-0000-0000-00000000000b','buzzora','t','x')$$, false);
select pg_temp.attempt('watcher: can post to buzzora', '00000000-0000-0000-0000-00000000000a', $$insert into public.experience_posts (author_id, board, buzz_kind, country, title, body) values ('00000000-0000-0000-0000-00000000000a','buzzora','law','Finland','t','x')$$, true);
select pg_temp.attempt('server job (no user): can post AI brief', '', $$insert into public.experience_posts (author_id, board, buzz_kind, country, sources, is_ai, title, body) values ('00000000-0000-0000-0000-0000000000ff','buzzora','news','Japan','[{"url":"https://a.b"}]',true,'t2','x')$$, true);
select pg_temp.attempt('server job: video pick', '', $$insert into public.experience_posts (author_id, category, is_ai, link_url, link_platform, title, body) values ('00000000-0000-0000-0000-0000000000ff','videos',true,'https://www.youtube.com/watch?v=abc','youtube','v','x')$$, true);
select pg_temp.attempt('same video twice is refused', '', $$insert into public.experience_posts (author_id, category, is_ai, link_url, link_platform, title, body) values ('00000000-0000-0000-0000-0000000000ff','videos',true,'https://www.youtube.com/watch?v=abc','youtube','v','x')$$, false);
select pg_temp.attempt('bad platform refused', '', $$insert into public.experience_posts (author_id, category, link_url, link_platform, title, body) values ('00000000-0000-0000-0000-0000000000ff','videos','https://x.y/z','myspace','v','x')$$, false);
select pg_temp.attempt('bad tab refused', '', $$insert into public.experience_posts (author_id, board, buzz_kind, title, body) values ('00000000-0000-0000-0000-0000000000ff','buzzora','gossip','v','x')$$, false);
-- a deacon (reviewer, not creator/watcher) can still delete (soft delete) an AI post
select pg_temp.attempt('deacon: can soft-delete a buzzora post', '00000000-0000-0000-0000-00000000000b', $$update public.experience_posts set deleted_at = now(), deleted_by = '00000000-0000-0000-0000-00000000000b' where title = 't2'$$, true);
select pg_temp.attempt('deacon: cannot move post to another board', '00000000-0000-0000-0000-00000000000b', $$update public.experience_posts set board = 'experience' where title = 't'$$, false);
select pg_temp.attempt('member: cannot turn own post into Videos', '00000000-0000-0000-0000-00000000000c', $$update public.experience_posts set category = 'videos' where title = 'hi'$$, false);
select pg_temp.attempt('view counter update (server) still works', '', $$update public.experience_posts set views = views + 1 where title = 't'$$, true);
select name, case when ok then 'PASS' else 'FAIL' end as result from results;
select 'settings rows: ' || count(*) from public.hub_settings;
