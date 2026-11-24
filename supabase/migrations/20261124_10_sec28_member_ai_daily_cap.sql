-- AOE-SEC-28: each member's own daily share of the hub AI (questions per day),
-- on top of the 30-per-10-minutes limit. Default 100; change it in hub_settings
-- ('hub_ai_member_daily_cap'; 0 = members can't ask). The code uses 100 when the
-- row is missing, so this can run before or after the deploy.
-- Safe to run more than once (it never overwrites a value Clara has changed).
-- Mirrors supabase/schema.sql.

insert into public.hub_settings (key, value) values
  ('hub_ai_member_daily_cap', '100'::jsonb)
on conflict (key) do nothing;
