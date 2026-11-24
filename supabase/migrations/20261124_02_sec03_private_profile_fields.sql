-- AOE-SEC-03: strangers (and other members) can no longer read private profile fields.
-- Before: anyone with the public site key could read every member's region,
-- onboarding answers, referral source, age check and language.
-- After: the browser can read only the public columns; the owner reads their own
-- full row through my_profile(). Safe to run more than once.
-- Deploy the new hub code at the same time (the old code reads profiles with
-- select=* and would stop loading profiles until it is updated).

revoke select on public.profiles from anon, authenticated;
grant select (id, name, display_name, member_since, followers_count, following_count, files_count,
              avatar_path, profile_frame, profile_background, post_font)
  on public.profiles to anon, authenticated;

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

-- Check (read-only), should be false / false:
--   select has_column_privilege('anon', 'public.profiles', 'region', 'select'),
--          has_column_privilege('authenticated', 'public.profiles', 'onboarding_experience', 'select');
