# AOEhub recovery notes (private — keep this file out of the public site)

First version, written with the roles/trash/activity-log foundation. More is added as each safety feature is built (Creator recovery keys, email recovery, backups restore).

## Make an account the Creator (or restore the Creator after a lockout)

The Creator role is never handed out inside the app. Whoever owns the Supabase account sets it directly. In **Supabase → SQL Editor**:

```sql
-- replace the email with the Creator's sign-in email
insert into public.user_roles (user_id, role)
select u.id, 'creator' from auth.users u where u.email = 'creator@example.com'
on conflict do nothing;
```

To take it away from an account that should not have it any more:

```sql
delete from public.user_roles
 where role = 'creator'
   and user_id = (select id from auth.users where email = 'old-creator@example.com');
```

## The Creator is locked out (lost authenticator app, forgotten access code, or locked after wrong tries)

First try the recovery keys: on the Creator unlock screen choose **Locked out?** and type one. If you have no keys left, the owner of the Supabase account can reset each protection in the **SQL Editor** (replace the email):

```sql
-- Forgot the access code: remove it. The next visit to the Creator panel asks you to choose a new one.
delete from public.creator_access
 where user_id = (select id from auth.users where email = 'creator@example.com');

-- Lost the authenticator app: remove the two-step factor. Sign in, then turn it on again (Settings → Two-step sign-in).
delete from auth.mfa_factors
 where user_id = (select id from auth.users where email = 'creator@example.com');

-- Locked after wrong tries: clear the counter (it also clears itself after 15 minutes).
delete from public.creator_security_events
 where kind in ('code-wrong', 'key-wrong')
   and user_id = (select id from auth.users where email = 'creator@example.com');

-- Force a fresh unlock everywhere (for example if a session may have been seen by someone else).
delete from public.creator_sessions
 where user_id = (select id from auth.users where email = 'creator@example.com');
```

The recovery e-mail with a waiting period (chat6) is not built yet: it needs the e-mail service (setup checklist item 6).

## After restoring the database from a backup

The nightly backup leaves out the AI's search data (the vectors) because it can be rebuilt. After a restore, tell the app those documents still need indexing, then press **Update index** in the admin dashboard:

```sql
update public.kb_documents set indexed_model = null;
```

## Before launch: clear the test records

Several tables are append-only on purpose (nobody, not even the app, can edit or delete rows): `activity_log` and `warnings`. Test actions made before launch stay in them. On launch day the database owner can clear them once, in the **SQL Editor**. First restore or empty the trash (items still in the trash lose their restore link when the log is cleared). After launch these are evidence — never clear them again.

```sql
-- 1. Test content still in the trash and test accounts: erase them first.
--    (Purging also needs the stored files removed; simplest is to restore or
--    hard-delete any test items by hand in the Table Editor before this.)

-- 2. Clear the evidence tables.
alter table public.activity_log disable trigger activity_log_no_change;
alter table public.activity_log disable trigger activity_log_no_truncate;
truncate public.activity_log restart identity cascade;
alter table public.activity_log enable trigger activity_log_no_change;
alter table public.activity_log enable trigger activity_log_no_truncate;

alter table public.warnings disable trigger warnings_protect;
alter table public.warnings disable trigger warnings_no_truncate;
truncate public.warnings;
alter table public.warnings enable trigger warnings_protect;
alter table public.warnings enable trigger warnings_no_truncate;

truncate public.restrictions, public.account_referrals, public.creator_security_events;
delete from public.item_notices;
delete from public.notifications where kind in ('warning','warning-withdrawn','content-removed','role-granted','role-revoked','account-suspended','suspension-review','restriction','account-referral');
```
