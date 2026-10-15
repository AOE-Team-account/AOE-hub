-- AOEhub — clean slate before the testing stage (and before launch).
--
-- Run this ONCE in the Supabase SQL Editor when testing with real accounts
-- begins (decided by Clara, 2026-10-15). After it the hub is completely
-- empty: no accounts, no posts, no files, no comments, no reports, no
-- warnings, no activity log, no notifications. What stays:
--   * the 13 philosophy books and the hub guide in the AI's knowledge base
--     (kb_documents / kb_chunks), and
--   * the hub's own settings, reasons, permissions, role definitions and
--     terms versions (configuration, not content).
-- The API keys live in .env.local / hosting settings and are not touched.
--
-- NEVER run this after launch: warnings and the activity log are evidence.

do $$
begin
  if exists (select 1 from public.file_assets where storage_path is not null) then
    raise exception 'Stored files exist. Delete them from Cloudflare R2 / the Internet Archive first, delete the file_assets rows, then run this again.';
  end if;
end $$;

-- The evidence tables refuse changes on purpose; lift that for this one run.
alter table public.activity_log disable trigger activity_log_no_change;
alter table public.activity_log disable trigger activity_log_no_truncate;
alter table public.warnings disable trigger warnings_protect;
alter table public.warnings disable trigger warnings_no_truncate;

-- Every account. Profiles, posts, files, comments, reports, notifications,
-- points, views, roles, pins, AI-key settings and Creator access rows go with it.
delete from auth.users;

-- Tables with no link to accounts (they must outlive them), emptied by hand.
truncate public.activity_log restart identity;
truncate public.warnings;
truncate public.restrictions, public.account_referrals, public.creator_security_events;
delete from public.item_notices;
delete from public.kb_documents where source_type not in ('philosophy-text', 'hub-guide');

alter table public.activity_log enable trigger activity_log_no_change;
alter table public.activity_log enable trigger activity_log_no_truncate;
alter table public.warnings enable trigger warnings_protect;
alter table public.warnings enable trigger warnings_no_truncate;

-- What is left (all should be 0 except the knowledge base):
select 'accounts' as what, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'file posts', count(*) from public.file_posts
union all select 'experience posts', count(*) from public.experience_posts
union all select 'comments', count(*) from public.comments
union all select 'reports', count(*) from public.reports
union all select 'notifications', count(*) from public.notifications
union all select 'activity log', count(*) from public.activity_log
union all select 'warnings', count(*) from public.warnings
union all select 'knowledge base documents (books + hub guide)', count(*) from public.kb_documents;
