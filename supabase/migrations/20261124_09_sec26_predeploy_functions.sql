-- AOE-SEC-26: run BEFORE deploying the new hub code (after 03).
-- The new code calls my_profile() (members' own profile) and create_file_post()
-- (uploads). They used to be created only by 02 and 05, which run AFTER the deploy,
-- so for a few minutes signed-in members had no profile and uploads failed.
-- This file creates just the two functions, with their final rights. It changes
-- nothing for the old code: nothing old calls them, and no table rights change here.
-- 02 and 05 keep the same definitions (identical text), so re-running any of them
-- in any order gives the same result. Safe to run more than once.
-- Mirrors supabase/schema.sql.

create or replace function public.my_profile()
returns setof public.profiles
language sql
security definer
stable
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated, service_role;

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

-- Check (expect t, f, t, f):
--   select has_function_privilege('authenticated', 'public.my_profile()', 'execute'),
--          has_function_privilege('anon', 'public.my_profile()', 'execute'),
--          has_function_privilege('service_role', 'public.create_file_post(uuid, text, text, text, text, text, uuid, boolean)', 'execute'),
--          has_function_privilege('authenticated', 'public.create_file_post(uuid, text, text, text, text, text, uuid, boolean)', 'execute');
