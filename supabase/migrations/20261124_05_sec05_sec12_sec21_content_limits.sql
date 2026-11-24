-- AOE-SEC-05 (size and speed limits, file posts only through the upload route),
-- AOE-SEC-12 (members cannot hard-delete directly; the server keeps reported items),
-- AOE-SEC-21 (files of suspended members cannot be downloaded by direct link).
-- Needs migration 03 first (private.require_server). Safe to run more than once.
-- Deploy the new hub code at the same time: the upload route now calls
-- create_file_post() and the delete route now deletes with the server key.

revoke insert, delete on public.file_posts from authenticated;
revoke delete on public.experience_posts from authenticated;
revoke delete on public.comments from authenticated;

-- ============================================================================
-- Size and speed limits for what members write (AOE-SEC-05). Members write posts,
-- comments and reports straight into the database, so the limits live here, not
-- only in the browser. NOT VALID: only new and changed rows are checked.
-- The hub's own server jobs (no signed-in member) are not speed-limited.
-- ============================================================================
alter table public.experience_posts drop constraint if exists experience_posts_body_len;
alter table public.experience_posts add constraint experience_posts_body_len check (char_length(body) between 1 and 20000) not valid;
alter table public.experience_posts drop constraint if exists experience_posts_title_len;
alter table public.experience_posts add constraint experience_posts_title_len check (title is null or char_length(title) <= 300) not valid;
alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments add constraint comments_body_len check (char_length(body) between 1 and 5000) not valid;
alter table public.file_posts drop constraint if exists file_posts_title_len;
alter table public.file_posts add constraint file_posts_title_len check (char_length(title) between 1 and 300) not valid;
alter table public.file_posts drop constraint if exists file_posts_description_len;
alter table public.file_posts add constraint file_posts_description_len check (char_length(description) <= 10000) not valid;
alter table public.reports drop constraint if exists reports_details_len;
alter table public.reports add constraint reports_details_len check (details is null or char_length(details) <= 5000) not valid;

create or replace function private.limit_member_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then return new; end if;  -- the hub's own server jobs
  if tg_table_name = 'comments' then
    select count(*) into v_n from public.comments where author_id = v_uid and created_at > now() - interval '10 minutes';
    if v_n >= 20 then raise exception 'You are commenting very quickly. Please wait a few minutes.'; end if;
  elsif tg_table_name = 'experience_posts' then
    select count(*) into v_n from public.experience_posts where author_id = v_uid and created_at > now() - interval '1 day';
    if v_n >= 10 then raise exception 'You can share up to 10 posts a day. Please try again tomorrow.'; end if;
  elsif tg_table_name = 'reports' then
    select count(*) into v_n from public.reports where reported_by = v_uid and created_at > now() - interval '1 hour';
    if v_n >= 30 then raise exception 'You have sent many reports this hour. Please wait a little.'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_limit_writes on public.comments;
create trigger comments_limit_writes before insert on public.comments
  for each row execute function private.limit_member_writes();
drop trigger if exists experience_posts_limit_writes on public.experience_posts;
create trigger experience_posts_limit_writes before insert on public.experience_posts
  for each row execute function private.limit_member_writes();
drop trigger if exists reports_limit_writes on public.reports;
create trigger reports_limit_writes before insert on public.reports
  for each row execute function private.limit_member_writes();

-- The upload route creates file posts with this (server only), after its own checks.
create or replace function public.create_file_post(
  p_author uuid, p_title text, p_description text, p_section text, p_media_type text,
  p_authorship text, p_remix_of uuid, p_made_with_ai boolean
)
returns setof public.file_posts
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  perform private.require_server();
  if not private.can_participate(p_author) then
    raise exception 'This account cannot post right now.' using errcode = '42501';
  end if;
  if (select count(*) from public.file_posts where author_id = p_author and created_at > now() - interval '1 day') >= 30 then
    raise exception 'You can share up to 30 file posts a day. Please try again tomorrow.';
  end if;
  return query
  insert into public.file_posts (author_id, title, description, section, media_type, authorship, remix_of_post_id, made_with_ai)
  values (p_author, p_title, p_description, p_section, p_media_type, p_authorship, p_remix_of, coalesce(p_made_with_ai, false))
  returning *;
end;
$$;
revoke execute on function public.create_file_post(uuid, text, text, text, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_file_post(uuid, text, text, text, text, text, uuid, boolean) to service_role;

-- AOE-SEC-21: a file of a suspended (or deleted) member cannot be downloaded by
-- direct link; the asset follows its post's author, like the post itself.
drop policy if exists "clean file assets are publicly readable" on public.file_assets;
create policy "clean file assets are publicly readable" on public.file_assets
  for select using (
    (scan_status = 'clean'
       and exists (select 1 from public.file_posts p
                    where p.id = file_post_id and p.deleted_at is null and private.author_is_active(p.author_id)))
    or exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid() and deleted_at is null)
    or private.reviewer_can(auth.uid(), 'file', 'view')
  );

