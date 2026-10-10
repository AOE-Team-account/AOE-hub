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

## After restoring the database from a backup

The nightly backup leaves out the AI's search data (the vectors) because it can be rebuilt. After a restore, tell the app those documents still need indexing, then press **Update index** in the admin dashboard:

```sql
update public.kb_documents set indexed_model = null;
```

## The activity log is append-only (and so are test rows in it)

`public.activity_log` refuses updates, deletes and truncates, on purpose. Rows created while testing before launch stay there. If you want a clean log on launch day, the database owner can clear it once, in the SQL Editor:

```sql
alter table public.activity_log disable trigger activity_log_no_change;
alter table public.activity_log disable trigger activity_log_no_truncate;
truncate public.activity_log restart identity cascade;
alter table public.activity_log enable trigger activity_log_no_change;
alter table public.activity_log enable trigger activity_log_no_truncate;
```

Do this only before launch. After launch the log is evidence.
