-- AOE-SEC-04: shared (database) rate limits and a daily cap for the hub AI.
-- Needs migration 03 first (private.require_server). Safe to run more than once.
-- Run BEFORE deploying the new hub code (the code falls back to in-memory limits if this is missing, but the AI cap then fails closed).

-- ============================================================================
-- Shared rate limits (AOE-SEC-04). Counters every server process shares and that
-- survive a restart. Buckets are fingerprints (hashes) made by the server, never
-- raw addresses. Server only. Old windows are cleared as it goes.
-- ============================================================================
create table if not exists public.rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

create or replace function public.take_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_window integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);
  v_hits integer;
begin
  perform private.require_server();
  if p_bucket is null or length(p_bucket) > 100 then raise exception 'Bad bucket.'; end if;
  insert into public.rate_limit_counters as c (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = c.hits + 1
  returning hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limit_counters where window_start < now() - interval '2 days';
  end if;
  return v_hits <= greatest(p_limit, 0);
end;
$$;
revoke execute on function public.take_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, integer, integer) to service_role;

-- The hub AI's daily allowance (questions a day), kept in translation_usage under
-- the kinds 'hub-ai' and 'hub-ai-guest'. The Creator can change these numbers.
insert into public.hub_settings (key, value) values
  ('hub_ai_daily_cap', '1500'::jsonb),
  ('hub_ai_guest_daily_cap', '300'::jsonb)
on conflict (key) do nothing;
