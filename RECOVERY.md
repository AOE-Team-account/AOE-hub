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

The nightly backup leaves out the AI's search data (the vectors, `kb_chunks`) because it can be rebuilt. After a restore the app must be told those documents still need indexing, then press **Update index** in the Admin tools page (it may take a few runs; Google's daily limit can slow it):

```sql
delete from public.kb_chunks;
delete from public.kb_document_models;
```

Backups are kept as one file per night under `backups/daily/` in Backblaze: every night for 30 days, then one a week (Sundays) for a year (`scripts/prune-backups.py`). In the Backblaze bucket settings choose the lifecycle rule **"Keep only the last version of the file"**, otherwise B2 keeps hidden copies of deleted backups and the space never frees up.

## Start of the testing stage: empty the hub

When testing with real accounts begins (and again just before launch if test data crept in), the hub must be completely empty: no accounts, no posts, no files, no comments, no placeholders. Only the 13 books and the hub guide in the AI's knowledge base stay, and the API keys (which live in `.env.local` / the hosting settings, not in the database).

1. If any test files were uploaded, delete them from Cloudflare R2 / the Internet Archive and delete their `file_assets` rows first (the script refuses to run while stored files exist).
2. In the **Supabase SQL Editor**, paste and run the whole of `supabase/reset-for-testing.sql`. The last lines print a count of what is left: everything 0 except the knowledge base documents (14).
3. Never run it after launch: warnings and the activity log are evidence.

## Your first Creator account on the hub

1. Open the hub and **sign up** with your real email (tick the 13+ and terms box). Confirm the email if it asks.
2. In the **Supabase SQL Editor** run (with your email):
```sql
insert into public.user_roles (user_id, role)
select id, 'creator' from auth.users where email = 'YOUR-EMAIL@example.com'
on conflict do nothing;
```
3. Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy).
4. Sign in on the hub, open your **profile** and press **Open Creator panel**.
5. **Step 1:** scan the picture with the authenticator app and type the 6-digit code.
6. **Step 2:** choose your access code (at least 10 characters), typed twice.
7. **Save the 6 recovery keys** shown once (password manager or paper, never on the device you sign in from) and press "I have saved them".
8. From then on each new sign-in asks for the 6-digit code, then the access code. The panel locks after 30 idle minutes.
9. The Creator account cannot post, upload or comment. Use a second, ordinary account for that.

