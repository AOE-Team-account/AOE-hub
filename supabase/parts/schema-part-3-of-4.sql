-- AOEhub database setup, part 3 of 4. Run the parts in order (1, 2, 3 ...). Each part is safe to run again.

-- ============================================================================
-- Moderation actions (chat6: Roles & moderation powers; Trust & safety)
-- Every one of these checks the caller's role on the server, every time,
-- writes the activity log, and tells the affected person privately. None of
-- them announces anything publicly.
-- ============================================================================

-- Delete (to the trash) a file post, experience post or comment.
create or replace function public.soft_delete_item(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_row jsonb;
  v_reason public.moderation_reasons;
  v_reports uuid[];
  v_report_type text;
  v_label text;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('file', 'post', 'comment') then raise exception 'Unknown kind of item.'; end if;
  if not private.reviewer_can(v_uid, p_kind, 'delete') then
    raise exception 'You are not allowed to delete this kind of item.';
  end if;

  select * into v_reason from public.moderation_reasons
   where code = p_reason and active and 'delete' = any (applies_to);
  if not found then raise exception 'Pick a reason from the list.'; end if;

  if p_kind = 'file' then
    select author_id, to_jsonb(t) into v_author, v_row from public.file_posts t where id = p_id and deleted_at is null;
  elsif p_kind = 'post' then
    select author_id, to_jsonb(t) into v_author, v_row from public.experience_posts t where id = p_id and deleted_at is null;
  else
    select author_id, to_jsonb(t) into v_author, v_row from public.comments t where id = p_id and deleted_at is null;
  end if;
  if v_row is null then raise exception 'That item does not exist or is already deleted.'; end if;

  -- No self-review: you may see reports about your own item but never act on it.
  if v_author = v_uid then
    raise exception 'This one is yours. Another reviewer will handle it.';
  end if;

  if p_kind = 'file' then
    update public.file_posts set deleted_at = now(), deleted_by = v_uid, deleted_reason = p_reason where id = p_id;
    delete from public.kb_documents where source_type = 'file-post' and source_id = p_id;
  elsif p_kind = 'post' then
    update public.experience_posts set deleted_at = now(), deleted_by = v_uid, deleted_reason = p_reason where id = p_id;
    delete from public.kb_documents where source_type = 'experience-post' and source_id = p_id;
  else
    update public.comments set deleted_at = now(), deleted_by = v_uid, deleted_reason = p_reason where id = p_id;
  end if;

  -- Reports about it are settled by this deletion; remember which, so undoing
  -- the deletion can reopen exactly those.
  perform private.clear_pins_for_item(p_kind, p_id);
  if p_kind = 'comment' then perform private.drop_kb_for_comment(p_id); end if;
  if p_kind = 'post' then perform private.drop_kb_answers_on_post(p_id); end if;
  v_report_type := case p_kind when 'file' then 'file' when 'post' then 'experience-post' else 'comment' end;
  select coalesce(array_agg(id), '{}') into v_reports
    from public.reports where target_type = v_report_type and target_id = p_id and status = 'open';
  update public.reports set status = 'resolved' where id = any (v_reports);

  perform private.log_activity(
    v_uid, 'delete', p_kind, p_id, v_author, p_reason,
    jsonb_build_object('reason_label', v_reason.label, 'resolved_reports', to_jsonb(v_reports), 'snapshot', v_row)
  );

  v_label := case p_kind when 'file' then 'file' when 'post' then 'post' else 'comment' end;
  insert into public.notifications (user_id, body, kind, data)
  values (
    v_author,
    format('Your %s was removed because it broke our rules: %s.', v_label, v_reason.label),
    'content-removed',
    jsonb_build_object('item_kind', p_kind, 'reason', p_reason)
  );
end;
$$;

-- Settle a report without acting on the content.
create or replace function public.dismiss_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report public.reports;
  v_kind text;
  v_author uuid;
  v_reason public.moderation_reasons;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;

  select * into v_report from public.reports where id = p_report_id and status = 'open';
  if not found then raise exception 'That report does not exist or is already settled.'; end if;

  v_kind := private.report_kind(v_report.target_type);
  if not private.reviewer_can(v_uid, v_kind, 'dismiss') then
    raise exception 'You are not allowed to dismiss this kind of report.';
  end if;

  select * into v_reason from public.moderation_reasons
   where code = p_reason and active and 'dismiss' = any (applies_to);
  if not found then raise exception 'Pick a reason from the list.'; end if;

  v_author := private.item_author(v_kind, v_report.target_id);
  if v_author = v_uid then
    raise exception 'This one is yours. Another reviewer will handle it.';
  end if;

  update public.reports set status = 'dismissed' where id = p_report_id;

  perform private.log_activity(
    v_uid, 'dismiss-report', 'report', p_report_id, v_author, p_reason,
    jsonb_build_object('reason_label', v_reason.label, 'report_target_type', v_report.target_type,
                       'report_target_id', v_report.target_id, 'report_reason', v_report.reason)
  );
end;
$$;

-- Creator only: put a deleted item back (the same as undoing its deletion).
create or replace function public.restore_item(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id bigint;
begin
  if auth.uid() is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can restore.';
  end if;
  select l.id into v_log_id from public.activity_log l
   where l.action = 'delete' and l.target_kind = p_kind and l.target_id = p_id
     and not exists (select 1 from public.activity_log u where u.undoes = l.id)
   order by l.id desc limit 1;
  if v_log_id is null then raise exception 'That item is not in the trash.'; end if;
  perform public.undo_activity(v_log_id);
end;
$$;

-- Creator only: everything currently in the trash, with a snapshot.
create or replace function public.list_trash()
returns table (kind text, id uuid, title text, author_id uuid, deleted_at timestamptz, deleted_by uuid, deleted_reason text, snapshot jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can see deleted items.';
  end if;
  return query
    select 'file'::text, t.id, t.title, t.author_id, t.deleted_at, t.deleted_by, t.deleted_reason, to_jsonb(t)
      from public.file_posts t where t.deleted_at is not null
    union all
    select 'post'::text, t.id, coalesce(t.title, left(t.body, 80)), t.author_id, t.deleted_at, t.deleted_by, t.deleted_reason, to_jsonb(t)
      from public.experience_posts t where t.deleted_at is not null
    union all
    select 'comment'::text, t.id, left(t.body, 80), t.author_id, t.deleted_at, t.deleted_by, t.deleted_reason, to_jsonb(t)
      from public.comments t where t.deleted_at is not null
    order by 5 desc;
end;
$$;

-- Creator only: give or take away a role. The Creator role itself is never
-- handed out here (it is set directly in the database; see RECOVERY.md).
create or replace function public.grant_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_def public.role_definitions;
  v_n integer;
  v_body text;
begin
  if v_uid is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can give roles.';
  end if;
  select * into v_def from public.role_definitions where code = p_role;
  if not found or p_role = 'creator' then raise exception 'That role cannot be given here.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'That person does not exist.'; end if;
  if p_role in ('watcher', 'deacon') and private.setting_true('require_2fa_staff')
     and not exists (select 1 from auth.mfa_factors where user_id = p_user_id and status = 'verified') then
    raise exception 'They need to turn on two-step sign-in (Settings) before they can be made a %.', v_def.label;
  end if;

  insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, v_uid)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;

  perform private.log_activity(v_uid, 'role-granted', 'user', p_user_id, p_user_id, null, jsonb_build_object('role', p_role));

  v_body := case p_role
    when 'watcher'  then 'You have been chosen by the Creator to become a Watcher. You can now see every post, comment and file, review reports, add notices, warn and delete.'
    when 'deacon'   then 'You have been chosen by the Creator to become a Deacon. You can now see every post and comment, review their reports, add notices, warn and delete.'
    when 'answerer' then 'The Creator has made you an Answerer. Your posts, files and comments are pinned to the top and an A badge appears next to your name.'
    when 'verified' then 'The Creator has verified you. A V badge appears next to your name and your comments are highlighted.'
    else format('The Creator has given you the %s role.', v_def.label)
  end;
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id, v_body, 'role-granted', jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.revoke_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_def public.role_definitions;
  v_n integer;
begin
  if v_uid is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can take roles away.';
  end if;
  select * into v_def from public.role_definitions where code = p_role;
  if not found or p_role = 'creator' then raise exception 'That role cannot be removed here.'; end if;

  delete from public.user_roles where user_id = p_user_id and role = p_role;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;

  if p_role = 'verified' then
    delete from public.verified_pins where user_id = p_user_id;
  end if;
  -- Their answers stop feeding the AI at once; if they still hold the other
  -- badge role, the next index run puts them back.
  if p_role in ('answerer', 'verified') then
    perform private.drop_kb_answers_by(p_user_id);
  end if;
  perform private.log_activity(v_uid, 'role-revoked', 'user', p_user_id, p_user_id, null, jsonb_build_object('role', p_role));
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id, format('The Creator has removed your %s role. Your account stays as it is.', v_def.label),
          'role-revoked', jsonb_build_object('role', p_role));
end;
$$;

drop function if exists public.record_account_deletion(uuid, uuid);

-- Records that the signed-in person accepted a version of a document.
create or replace function public.accept_terms(p_kind text, p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if not exists (select 1 from public.terms_versions where kind = p_kind and version = p_version) then
    raise exception 'Unknown document version.';
  end if;
  insert into public.terms_acceptances (user_id, kind, version) values (auth.uid(), p_kind, p_version)
  on conflict do nothing;
end;
$$;

-- Which current documents the signed-in person has not accepted yet, for one
-- scope ('hub' or 'marketplace'). Powers a "review and accept updated terms"
-- screen that can gate a single feature instead of the whole site.
create or replace function public.pending_terms(p_scope text default 'hub')
returns table (kind text, version text)
language sql
security definer
stable
set search_path = public
as $$
  select tv.kind, tv.version
    from public.terms_versions tv
   where tv.scope = p_scope
     and tv.published_at = (select max(t2.published_at) from public.terms_versions t2 where t2.kind = tv.kind and t2.scope = tv.scope)
     and not exists (
       select 1 from public.terms_acceptances a
        where a.user_id = auth.uid() and a.kind = tv.kind and a.version = tv.version
     );
$$;

revoke execute on function public.soft_delete_item(text, uuid, text) from public, anon;
revoke execute on function public.dismiss_report(uuid, text) from public, anon;
revoke execute on function public.restore_item(text, uuid) from public, anon;
revoke execute on function public.list_trash() from public, anon;
revoke execute on function public.grant_role(uuid, text) from public, anon;
revoke execute on function public.revoke_role(uuid, text) from public, anon;
revoke execute on function public.accept_terms(text, text) from public, anon;
revoke execute on function public.pending_terms(text) from public, anon;
grant execute on function public.soft_delete_item(text, uuid, text) to authenticated;
grant execute on function public.dismiss_report(uuid, text) to authenticated;
grant execute on function public.restore_item(text, uuid) to authenticated;
grant execute on function public.list_trash() to authenticated;
grant execute on function public.grant_role(uuid, text) to authenticated;
grant execute on function public.revoke_role(uuid, text) to authenticated;
grant execute on function public.accept_terms(text, text) to authenticated;
grant execute on function public.pending_terms(text) to authenticated;

-- ---- Retire the old is_admin flag ------------------------------------------
-- Everything above now decides by role. Anyone who held the old flag becomes
-- Creator (the closest match: they could do everything), the flag and the
-- public is_admin() function go, and from now on the Creator role is set
-- only in the database (see RECOVERY.md). Must stay last: it drops things the
-- older definitions above depended on.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin') then
    execute 'insert into public.user_roles (user_id, role) select id, ''creator'' from public.profiles where is_admin on conflict do nothing';
    execute 'alter table public.profiles drop column is_admin';
  end if;
end $$;
drop function if exists public.is_admin(uuid);
drop function if exists private.is_admin(uuid);


-- ============================================================================
-- Warnings, notices, suspension, account deletion (chat6: Warnings, Roles)
-- ============================================================================

-- Looks up an item's author and a snapshot of it (for evidence). Raises if it
-- is missing or already in the trash.
create or replace function private.item_snapshot(p_kind text, p_id uuid, out o_author uuid, out o_row jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_kind = 'file' then
    select author_id, to_jsonb(t) into o_author, o_row from public.file_posts t where id = p_id and deleted_at is null;
  elsif p_kind = 'post' then
    select author_id, to_jsonb(t) into o_author, o_row from public.experience_posts t where id = p_id and deleted_at is null;
  elsif p_kind = 'comment' then
    select author_id, to_jsonb(t) into o_author, o_row from public.comments t where id = p_id and deleted_at is null;
  end if;
  if o_row is null then raise exception 'That item does not exist or is already deleted.'; end if;
end;
$$;

-- Settles every open report on an item and returns the ids (so an undo can
-- reopen exactly those).
create or replace function private.settle_reports(p_kind text, p_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := case p_kind when 'file' then 'file' when 'post' then 'experience-post' else 'comment' end;
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from public.reports where target_type = v_type and target_id = p_id and status = 'open';
  update public.reports set status = 'resolved' where id = any (v_ids);
  return v_ids;
end;
$$;

-- Warn the person who posted something. The reason sets the level.
create or replace function public.warn_user(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_row jsonb;
  v_reason public.moderation_reasons;
  v_before integer;
  v_after integer;
  v_warning uuid;
  v_reports uuid[];
  v_restricted boolean := false;
  v_body text;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('file', 'post', 'comment') then raise exception 'Unknown kind of item.'; end if;
  if not private.reviewer_can(v_uid, p_kind, 'warn') then raise exception 'You are not allowed to warn about this kind of item.'; end if;

  select * into v_reason from public.moderation_reasons
   where code = p_reason and active and 'warn' = any (applies_to) and level is not null;
  if not found then raise exception 'Pick a reason from the list.'; end if;

  select o_author, o_row into v_author, v_row from private.item_snapshot(p_kind, p_id);
  if v_author = v_uid then raise exception 'This one is yours. Another reviewer will handle it.'; end if;

  select red into v_before from private.warning_counts(v_author);

  insert into public.warnings (user_id, item_kind, item_id, reason_code, level, issued_by, issued_role, snapshot)
  values (v_author, p_kind, p_id, p_reason, v_reason.level, v_uid, private.top_reviewer_role(v_uid), v_row)
  returning id into v_warning;

  select red into v_after from private.warning_counts(v_author);
  v_reports := private.settle_reports(p_kind, p_id);
  perform private.clear_pins_for_item(p_kind, p_id);

  -- Crossing 3 red starts the one-week restriction, once.
  if coalesce(v_before, 0) < 3 and v_after >= 3 then
    insert into public.restrictions (user_id, caused_by_warning, set_by, ends_at)
    values (v_author, v_warning, v_uid, now() + interval '7 days');
    v_restricted := true;
  end if;

  perform private.log_activity(
    v_uid, 'warn', p_kind, p_id, v_author, p_reason,
    jsonb_build_object('warning_id', v_warning, 'level', v_reason.level, 'reason_label', v_reason.label,
                       'resolved_reports', to_jsonb(v_reports), 'snapshot', v_row,
                       'record_after', private.record_text(v_author), 'restriction_started', v_restricted)
  );

  v_body := format('You received a %s warning: %s. Your record: %s. Repeated warnings lead to restrictions.',
                   v_reason.level, v_reason.label, private.record_text(v_author));
  if v_restricted then
    v_body := v_body || ' Your account is restricted for one week: you can read and download, but not post, upload or comment.';
  end if;
  insert into public.notifications (user_id, body, kind, data)
  values (v_author, v_body, 'warning', jsonb_build_object('level', v_reason.level, 'reason', p_reason, 'restricted', v_restricted));
end;
$$;

-- Add or edit the notice shown above a post, file or comment.
create or replace function public.set_notice(p_kind text, p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text;
  v_author uuid;
  v_row jsonb;
  v_prev public.item_notices;
  v_body text;
  v_reports uuid[];
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('file', 'post', 'comment') then raise exception 'Unknown kind of item.'; end if;
  if not private.reviewer_can(v_uid, p_kind, 'notice') then raise exception 'You are not allowed to add a notice here.'; end if;

  select o_author, o_row into v_author, v_row from private.item_snapshot(p_kind, p_id);
  if v_author = v_uid then raise exception 'This one is yours. Another reviewer will handle it.'; end if;

  v_tier := private.top_reviewer_role(v_uid);
  v_body := nullif(btrim(coalesce(p_body, '')), '');
  if v_body is null then v_body := 'Content below is not fully correct.'; end if;
  if char_length(v_body) > 500 then raise exception 'A notice can be at most 500 characters.'; end if;

  select * into v_prev from public.item_notices where item_kind = p_kind and item_id = p_id;
  -- Only the Creator can change or remove a notice the Creator added.
  if found and v_prev.tier = 'creator' and v_tier <> 'creator' then
    raise exception 'Only the Creator can change this notice.';
  end if;

  insert into public.item_notices (item_kind, item_id, body, tier)
  values (p_kind, p_id, v_body, v_tier)
  on conflict (item_kind, item_id) do update set body = excluded.body, tier = excluded.tier, set_at = now();

  v_reports := private.settle_reports(p_kind, p_id);
  perform private.clear_pins_for_item(p_kind, p_id);
  if p_kind = 'comment' then perform private.drop_kb_for_comment(p_id); end if;

  perform private.log_activity(
    v_uid, 'notice-set', p_kind, p_id, v_author, null,
    jsonb_build_object('body', v_body, 'tier', v_tier, 'resolved_reports', to_jsonb(v_reports),
                       'previous', case when v_prev.item_id is null then null
                                        else jsonb_build_object('body', v_prev.body, 'tier', v_prev.tier, 'set_at', v_prev.set_at) end,
                       'snapshot', v_row)
  );
end;
$$;

create or replace function public.remove_notice(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text;
  v_prev public.item_notices;
  v_author uuid;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if p_kind not in ('file', 'post', 'comment') then raise exception 'Unknown kind of item.'; end if;
  if not private.reviewer_can(v_uid, p_kind, 'notice') then raise exception 'You are not allowed to change notices here.'; end if;

  select * into v_prev from public.item_notices where item_kind = p_kind and item_id = p_id;
  if not found then raise exception 'There is no notice to remove.'; end if;

  v_tier := private.top_reviewer_role(v_uid);
  if v_prev.tier = 'creator' and v_tier <> 'creator' then raise exception 'Only the Creator can remove this notice.'; end if;

  v_author := private.item_author(p_kind, p_id);
  if v_author = v_uid then raise exception 'This one is yours. Another reviewer will handle it.'; end if;

  delete from public.item_notices where item_kind = p_kind and item_id = p_id;

  perform private.log_activity(
    v_uid, 'notice-removed', p_kind, p_id, v_author, null,
    jsonb_build_object('previous', jsonb_build_object('body', v_prev.body, 'tier', v_prev.tier, 'set_at', v_prev.set_at))
  );
end;
$$;

-- Take back a deletion, a dismissed report, a warning or a notice change
-- (Creator only). Nothing in the log is edited: an "undo" row points at the
-- original. Deletions, notices and dismissals undo newest first per item;
-- warnings can be undone in any order because counts are recalculated.
create or replace function public.undo_activity(p_log_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_log public.activity_log;
  v_report_id uuid;
  v_warning public.warnings;
  v_prev jsonb;
  v_red integer;
begin
  if v_uid is null or not private.creator_unlocked(true) then
    raise exception 'Only the Creator can undo.';
  end if;

  select * into v_log from public.activity_log where id = p_log_id for update;
  if not found then raise exception 'That entry does not exist.'; end if;
  if v_log.undoes is not null then raise exception 'An undo cannot be undone.'; end if;
  if exists (select 1 from public.activity_log where undoes = p_log_id) then raise exception 'That entry was already undone.'; end if;
  if v_log.action not in ('delete', 'dismiss-report', 'warn', 'notice-set', 'notice-removed', 'suspend', 'restrict', 'delete-account') then
    raise exception 'That kind of entry cannot be undone yet.';
  end if;

  if v_log.action <> 'warn' and exists (
    select 1 from public.activity_log n
     where n.id > v_log.id and n.target_kind = v_log.target_kind and n.target_id = v_log.target_id
       and n.action not in ('warn', 'restore-account')
       and n.undoes is null
       and not exists (select 1 from public.activity_log u where u.undoes = n.id)
  ) then
    raise exception 'Undo the newer change on this item first.';
  end if;

  if v_log.action = 'delete' then
    if v_log.target_kind = 'file' then
      update public.file_posts set deleted_at = null, deleted_by = null, deleted_reason = null where id = v_log.target_id and deleted_at is not null;
    elsif v_log.target_kind = 'post' then
      update public.experience_posts set deleted_at = null, deleted_by = null, deleted_reason = null where id = v_log.target_id and deleted_at is not null;
    else
      update public.comments set deleted_at = null, deleted_by = null, deleted_reason = null where id = v_log.target_id and deleted_at is not null;
    end if;
    if not found then raise exception 'The item no longer exists.'; end if;

  elsif v_log.action = 'dismiss-report' then
    update public.reports set status = 'open' where id = v_log.target_id and status = 'dismissed';
    if not found then raise exception 'The report no longer exists.'; end if;

  elsif v_log.action = 'warn' then
    select * into v_warning from public.warnings where id = (v_log.details ->> 'warning_id')::uuid for update;
    if not found or v_warning.undone_at is not null then raise exception 'That warning was already undone.'; end if;
    update public.warnings set undone_at = now(), undone_by = v_uid where id = v_warning.id;

    select red into v_red from private.warning_counts(v_warning.user_id);
    if v_red < 3 then
      update public.restrictions set lifted_at = now(), lifted_reason = 'A warning was withdrawn'
       where user_id = v_warning.user_id and lifted_at is null and ends_at > now();
    end if;
    insert into public.notifications (user_id, body, kind, data)
    values (v_warning.user_id,
            format('A warning was withdrawn. Your record is now: %s.', private.record_text(v_warning.user_id)),
            'warning-withdrawn', jsonb_build_object('warning_id', v_warning.id));

  elsif v_log.action in ('suspend', 'delete-account') then
    if (select account_status from public.profiles where id = v_log.target_id)
       is distinct from (case v_log.action when 'suspend' then 'suspended' else 'deleted' end) then
      raise exception 'That account is no longer %.', case v_log.action when 'suspend' then 'suspended' else 'deleted' end;
    end if;
    perform private.apply_account_status(v_uid, v_log.target_id, 'active', null);
    insert into public.notifications (user_id, body, kind, data)
    values (v_log.target_id,
            case v_log.action when 'suspend' then 'Your suspension was lifted. You can use your account again.' else 'Your account was restored.' end,
            'account-restored', jsonb_build_object('undid', v_log.action));

  elsif v_log.action = 'restrict' then
    update public.restrictions set lifted_at = now(), lifted_reason = 'Undone by the Creator'
     where id = (v_log.details ->> 'restriction_id')::uuid and lifted_at is null;
    insert into public.notifications (user_id, body, kind, data)
    values (v_log.target_id, 'Your restriction was lifted.', 'restriction-lifted', '{}'::jsonb);

  elsif v_log.action in ('notice-set', 'notice-removed') then
    v_prev := v_log.details -> 'previous';
    if v_prev is null or jsonb_typeof(v_prev) = 'null' then
      delete from public.item_notices where item_kind = v_log.target_kind and item_id = v_log.target_id;
    else
      insert into public.item_notices (item_kind, item_id, body, tier, set_at)
      values (v_log.target_kind, v_log.target_id, v_prev ->> 'body', v_prev ->> 'tier', (v_prev ->> 'set_at')::timestamptz)
      on conflict (item_kind, item_id) do update set body = excluded.body, tier = excluded.tier, set_at = excluded.set_at;
    end if;
  end if;

  -- Reports that this action had settled come back, exactly as they were.
  if v_log.action in ('delete', 'warn', 'notice-set') then
    for v_report_id in select (jsonb_array_elements_text(coalesce(v_log.details -> 'resolved_reports', '[]'::jsonb)))::uuid loop
      update public.reports set status = 'open' where id = v_report_id and status = 'resolved';
    end loop;
  end if;

  perform private.log_activity(
    v_uid, 'undo', v_log.target_kind, v_log.target_id, v_log.subject_user_id, v_log.reason_code,
    jsonb_build_object('undid_action', v_log.action), p_log_id
  );
end;
$$;

-- Emergency suspension (a Watcher or the Creator; never a Deacon). Takes effect
-- at once: the account cannot sign in, post, upload or comment and its
-- content is hidden until the Creator decides.
create or replace function public.suspend_account(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason public.moderation_reasons;
  v_status text;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if not private.reviewer_can(v_uid, 'user', 'suspend') then raise exception 'You are not allowed to suspend accounts.'; end if;
  if p_user_id = v_uid then raise exception 'You cannot suspend yourself.'; end if;
  if private.is_reviewer(p_user_id) then
    raise exception 'Staff accounts cannot be suspended here. Ask the Creator to remove the role first.';
  end if;

  select * into v_reason from public.moderation_reasons
   where code = p_reason and active and 'suspend' = any (applies_to);
  if not found then raise exception 'Pick a reason from the list.'; end if;

  if (select count(*) from public.activity_log
       where actor_id = v_uid and action = 'suspend' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many suspensions in the last hour. Ask the Creator.';
  end if;

  select account_status into v_status from public.profiles where id = p_user_id;
  if v_status is null then raise exception 'That person does not exist.'; end if;
  if v_status <> 'active' then raise exception 'That account is already suspended or deleted.'; end if;

  update public.profiles
     set account_status = 'suspended', account_status_reason = p_reason, account_status_by = v_uid, account_status_changed_at = now()
   where id = p_user_id;
  -- A far-future date, not 'infinity': the auth service cannot read infinity
  -- and would answer "Database error querying schema" instead of "banned".
  update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
  perform private.drop_kb_for_author(p_user_id);

  perform private.log_activity(v_uid, 'suspend', 'user', p_user_id, p_user_id, p_reason,
                               jsonb_build_object('reason_label', v_reason.label));

  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id,
          format('Your account was suspended while the hub''s Creator reviews it. Reason: %s.', v_reason.label),
          'account-suspended', jsonb_build_object('reason', p_reason));
  perform private.notify_creators(
    format('An account was suspended for: %s. Open the Creator panel to review it.', v_reason.label),
    'suspension-review', jsonb_build_object('user_id', p_user_id, 'reason', p_reason));
end;
$$;

-- Creator only: set an account's standing. 'active' lifts a suspension or
-- restores a deleted account (within the 30 days); 'deleted' disables it.
-- Moves an account between active / suspended / deleted: the status, the
-- sign-in ban, the AI's copy of their content and any open referral. Used by
-- set_account_status() and by undo_activity(). Returns the previous status.
create or replace function private.apply_account_status(p_actor uuid, p_user uuid, p_status text, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  select account_status into v_old from public.profiles where id = p_user for update;
  if v_old is null then raise exception 'That person does not exist.'; end if;

  update public.profiles
     set account_status = p_status, account_status_reason = p_reason, account_status_by = p_actor,
         account_status_changed_at = now()
   where id = p_user;
  -- A far-future date, not 'infinity': the auth service cannot read infinity
  -- and would answer "Database error querying schema" instead of "banned".
  update auth.users
     set banned_until = case when p_status = 'active' then null else now() + interval '100 years' end
   where id = p_user;

  if p_status <> 'active' then
    perform private.drop_kb_for_author(p_user);
  end if;
  if p_status = 'deleted' then
    update public.account_referrals set status = 'deleted', decided_by = p_actor, decided_at = now()
     where user_id = p_user and status = 'open';
  end if;
  return v_old;
end;
$$;

-- Creator only: set an account's standing. 'active' lifts a suspension or
-- restores a deleted account (within the 30 days) and is recorded as an undo
-- of the suspension/deletion; 'deleted' disables it.
create or replace function public.set_account_status(p_user_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_profile jsonb;
  v_prior bigint;
begin
  if v_uid is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  if p_status not in ('active', 'deleted') then raise exception 'Unknown status.'; end if;
  if p_user_id = v_uid then raise exception 'You cannot change your own account here.'; end if;
  if p_status = 'deleted' and private.has_role(p_user_id, 'creator') then raise exception 'The Creator account cannot be deleted here.'; end if;

  select to_jsonb(p) into v_profile from public.profiles p where id = p_user_id;
  v_old := private.apply_account_status(v_uid, p_user_id, p_status, p_reason);
  if v_old = p_status then return; end if;

  if p_status = 'deleted' then
    perform private.log_activity(v_uid, 'delete-account', 'user', p_user_id, p_user_id, null,
                                 jsonb_build_object('from', v_old, 'by', 'creator', 'profile', v_profile));
  else
    -- Lifting a suspension or restoring a deleted account IS the undo of it.
    select l.id into v_prior from public.activity_log l
     where l.target_kind = 'user' and l.target_id = p_user_id and l.action in ('suspend', 'delete-account')
       and not exists (select 1 from public.activity_log u where u.undoes = l.id)
     order by l.id desc limit 1;
    if v_prior is not null then
      perform private.log_activity(v_uid, 'undo', 'user', p_user_id, p_user_id, null,
                                   jsonb_build_object('undid_action', (select action from public.activity_log where id = v_prior)), v_prior);
    else
      perform private.log_activity(v_uid, 'restore-account', 'user', p_user_id, p_user_id, null, jsonb_build_object('from', v_old));
    end if;
    insert into public.notifications (user_id, body, kind, data)
    values (p_user_id, case when v_old = 'suspended' then 'Your suspension was lifted. You can use your account again.'
                            else 'Your account was restored.' end,
            'account-restored', jsonb_build_object('from', v_old));
  end if;
end;
$$;

-- Any member may delete their own account. It is disabled and hidden at once
-- and erased for good after 30 days; until then the Creator can restore it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  if private.has_role(v_uid, 'creator') then
    raise exception 'The Creator account cannot be deleted from here. See RECOVERY.md.';
  end if;
  select to_jsonb(p) into v_profile from public.profiles p where id = v_uid and account_status <> 'deleted';
  if v_profile is null then raise exception 'That account is already deleted.'; end if;

  update public.profiles
     set account_status = 'deleted', account_status_reason = 'deleted by the member', account_status_by = v_uid,
         account_status_changed_at = now()
   where id = v_uid;
  update auth.users set banned_until = now() + interval '100 years' where id = v_uid;
  perform private.drop_kb_for_author(v_uid);

  perform private.log_activity(v_uid, 'delete-account', 'user', v_uid, v_uid, null,
                               jsonb_build_object('by', 'self', 'profile', v_profile));
end;
$$;

-- Creator only: apply the normal one-week restriction by hand (for example
-- after reviewing a suspension).
create or replace function public.restrict_account(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason public.moderation_reasons;
  v_restriction uuid;
begin
  if v_uid is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  select * into v_reason from public.moderation_reasons where code = p_reason and active and 'warn' = any (applies_to);
  if not found then raise exception 'Pick a reason from the list.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'That person does not exist.'; end if;

  insert into public.restrictions (user_id, set_by, ends_at) values (p_user_id, v_uid, now() + interval '7 days')
  returning id into v_restriction;
  perform private.log_activity(v_uid, 'restrict', 'user', p_user_id, p_user_id, p_reason,
                               jsonb_build_object('reason_label', v_reason.label, 'days', 7, 'restriction_id', v_restriction));
  insert into public.notifications (user_id, body, kind, data)
  values (p_user_id, 'Your account is restricted for one week: you can read and download, but not post, upload or comment.',
          'restriction', jsonb_build_object('reason', p_reason));
end;
$$;

-- A Watcher or Deacon reports an account to the Creator once it reaches 5 red.
create or replace function public.report_to_creator(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_red integer;
begin
  if v_uid is null or not (private.has_role(v_uid, 'watcher') or private.has_role(v_uid, 'deacon')) then
    raise exception 'Only a Watcher or Deacon can report an account to the Creator.';
  end if;
  if p_user_id = v_uid then raise exception 'You cannot report yourself.'; end if;
  select red into v_red from private.warning_counts(p_user_id);
  if v_red < 5 then raise exception 'An account can be reported to the Creator once it has 5 red warnings.'; end if;
  if exists (select 1 from public.account_referrals where user_id = p_user_id and status = 'open') then
    raise exception 'This account has already been reported.';
  end if;

  insert into public.account_referrals (user_id, reported_by) values (p_user_id, v_uid);
  perform private.log_activity(v_uid, 'report-to-creator', 'user', p_user_id, p_user_id, null,
                               jsonb_build_object('record', private.record_text(p_user_id)));
  perform private.notify_creators('An account was reported to you at 5 red warnings. Open the Creator panel → Accounts.',
                                  'account-referral', jsonb_build_object('user_id', p_user_id));
end;
$$;

-- Creator only: decide a referral.
create or replace function public.decide_referral(p_referral_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ref public.account_referrals;
begin
  if v_uid is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  if p_decision not in ('delete', 'dismiss') then raise exception 'Unknown decision.'; end if;
  select * into v_ref from public.account_referrals where id = p_referral_id and status = 'open' for update;
  if not found then raise exception 'That report does not exist or was already decided.'; end if;

  if p_decision = 'delete' then
    perform public.set_account_status(v_ref.user_id, 'deleted', 'repeated violations');
  else
    update public.account_referrals set status = 'dismissed', decided_by = v_uid, decided_at = now() where id = p_referral_id;
    perform private.log_activity(v_uid, 'dismiss-referral', 'user', v_ref.user_id, v_ref.user_id, null, '{}'::jsonb);
  end if;
end;
$$;

-- What reviewers see next to a person's name: a count in words, never the
-- warnings themselves.
create or replace function public.warning_summaries(p_user_ids uuid[])
returns table (user_id uuid, green integer, yellow integer, red integer, restricted boolean, account_status text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.is_reviewer(auth.uid()) then raise exception 'Reviewers only.'; end if;
  return query
    select p.id, c.green, c.yellow, c.red, private.is_restricted(p.id), p.account_status
      from public.profiles p, lateral private.warning_counts(p.id) c
     where p.id = any (p_user_ids);
end;
$$;

-- Creator only: everything on record about one person, for review or to hand
-- to a lawyer.
create or replace function public.person_evidence(p_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Only the Creator can do this.'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id),
    'record', private.record_text(p_user_id),
    'warnings', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at) from public.warnings w where w.user_id = p_user_id), '[]'::jsonb),
    'restrictions', coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at) from public.restrictions r where r.user_id = p_user_id), '[]'::jsonb),
    'referrals', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.account_referrals a where a.user_id = p_user_id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.activity_log l where l.subject_user_id = p_user_id), '[]'::jsonb)
  );
end;
$$;

-- ---- Erasing for good (30 days after deletion) ------------------------------
-- Run by the server (service role) from /api/cron/purge-trash, which first
-- deletes the stored files listed by list_expired_storage().


create or replace function public.purge_expired(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => p_days);
  v_files integer;
  v_posts integer;
  v_comments integer;
  v_accounts integer;
  v_ids uuid[];
begin
  delete from public.file_posts where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_files = row_count;
  delete from public.experience_posts where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_posts = row_count;
  delete from public.comments where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_comments = row_count;
  -- An account deleted more than p_days ago (by the member or by the Creator) goes
  -- completely: its warnings, restrictions, reports about it and the activity-log
  -- entries about it, then the account itself (which takes everything it owns).
  select array_agg(id) into v_ids from public.profiles where account_status = 'deleted' and account_status_changed_at < v_cutoff;
  if v_ids is not null then
    perform set_config('app.purge_ok', 'on', true);
    delete from public.reports where (target_type in ('user', 'profile-picture') and target_id = any (v_ids))
       or (target_type = 'file' and target_id in (select id from public.file_posts where author_id = any (v_ids)))
       or (target_type = 'experience-post' and target_id in (select id from public.experience_posts where author_id = any (v_ids)))
       or (target_type = 'comment' and target_id in (select id from public.comments where author_id = any (v_ids)));
    delete from public.warnings where user_id = any (v_ids);
    delete from public.restrictions where user_id = any (v_ids);
    delete from public.account_referrals where user_id = any (v_ids);
    delete from public.activity_log where subject_user_id = any (v_ids) and action <> 'purge';
    perform set_config('app.purge_ok', 'off', true);
  end if;
  -- Removing the auth user cascades to the profile and everything it owns.
  delete from auth.users where id = any (coalesce(v_ids, '{}'::uuid[]));
  get diagnostics v_accounts = row_count;

  if v_files + v_posts + v_comments + v_accounts > 0 then
    perform private.log_activity(null, 'purge', null, null, null, null,
      jsonb_build_object('file_posts', v_files, 'posts', v_posts, 'comments', v_comments, 'accounts', v_accounts, 'days', p_days));
  end if;
  return jsonb_build_object('file_posts', v_files, 'posts', v_posts, 'comments', v_comments, 'accounts', v_accounts);
end;
$$;

grant execute on function private.item_snapshot(text, uuid) to service_role;
grant execute on function private.settle_reports(text, uuid) to service_role;
grant execute on function private.notify_creators(text, text, jsonb) to service_role;
grant execute on function private.drop_kb_for_author(uuid) to service_role;

-- A Verified member pins one of their own posts or files to "From verified
-- voices". Refused if the item carries a notice or a warning.
create or replace function public.pin_my_item(p_board text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.has_role(v_uid, 'verified') then raise exception 'Only Verified members can pin here.'; end if;
  if p_board not in ('file', 'post') then raise exception 'Unknown board.'; end if;
  if private.item_author(p_board, p_item_id) is distinct from v_uid then raise exception 'You can only pin your own items.'; end if;
  if (p_board = 'file' and not exists (select 1 from public.file_posts where id = p_item_id and deleted_at is null))
     or (p_board = 'post' and not exists (select 1 from public.experience_posts where id = p_item_id and deleted_at is null)) then
    raise exception 'That item is not available.';
  end if;
  if exists (select 1 from public.item_notices where item_kind = p_board and item_id = p_item_id) then
    raise exception 'An item with a notice cannot be pinned.';
  end if;
  if exists (select 1 from public.warnings where item_kind = p_board and item_id = p_item_id and undone_at is null) then
    raise exception 'An item that received a warning cannot be pinned.';
  end if;

  insert into public.verified_pins (user_id, board, item_id) values (v_uid, p_board, p_item_id)
  on conflict (user_id, board) do update set item_id = excluded.item_id, pinned_at = now();
end;
$$;

create or replace function public.unpin_my_item(p_board text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.verified_pins where user_id = auth.uid() and board = p_board;
$$;


-- ============================================================================
-- Creator access: the functions the panel uses (chat6: recovery keys, wrong
-- code lockout, security events). Wrong attempts are RETURNED, not raised,
-- so that the attempt is still recorded (a raised error would roll it back).
-- ============================================================================

create or replace function private.recent_events(p_user uuid, p_kind text, p_minutes integer)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.creator_security_events
   where user_id = p_user and kind = p_kind and at > now() - make_interval(mins => p_minutes);
$$;

create or replace function private.add_event(p_user uuid, p_kind text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.creator_security_events (user_id, kind, details) values (p_user, p_kind, coalesce(p_details, '{}'::jsonb));
$$;

-- What the unlock screen needs to decide the next step.
create or replace function public.creator_status()
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wrong integer;
  v_last timestamptz;
begin
  if v_uid is null or not private.has_role(v_uid, 'creator') then
    return jsonb_build_object('is_creator', false);
  end if;
  v_wrong := private.recent_events(v_uid, 'code-wrong', 15) + private.recent_events(v_uid, 'key-wrong', 15);
  select max(at) into v_last from public.creator_security_events
   where user_id = v_uid and kind in ('code-wrong', 'key-wrong') and at > now() - interval '15 minutes';
  return jsonb_build_object(
    'is_creator', true,
    'has_code', exists (select 1 from public.creator_access where user_id = v_uid),
    'has_factor', exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified'),
    'aal2', private.is_aal2(),
    'unlocked', private.creator_unlocked(true),
    'locked', v_wrong >= 5,
    'locked_until', case when v_wrong >= 5 then v_last + interval '15 minutes' end,
    'keys_left', (select count(*) from public.creator_recovery_keys where user_id = v_uid and used_at is null)
  );
end;
$$;

-- Sets or changes the access code. First time: needs two-step sign-in. After
-- that: needs an unlocked session, or the current code.
create or replace function public.set_creator_code(p_new text, p_current text default null)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := private.session_id();
  v_hash text;
begin
  if v_uid is null or v_sid is null or not private.has_role(v_uid, 'creator') then raise exception 'Only the Creator can do this.'; end if;
  if not private.is_aal2() then raise exception 'Finish two-step sign-in first.'; end if;
  if p_new is null or char_length(p_new) < 10 then raise exception 'Use at least 10 characters for the access code.'; end if;

  select code_hash into v_hash from public.creator_access where user_id = v_uid;
  if v_hash is not null then
    if not private.creator_unlocked(false) and (p_current is null or crypt(p_current, v_hash) <> v_hash) then
      return jsonb_build_object('ok', false, 'error', 'The current code is not right.');
    end if;
  end if;

  insert into public.creator_access (user_id, code_hash) values (v_uid, crypt(p_new, gen_salt('bf')))
  on conflict (user_id) do update set code_hash = excluded.code_hash, updated_at = now();

  insert into public.creator_sessions (session_id, user_id, via) values (v_sid, v_uid, 'code')
  on conflict (session_id) do update set last_used_at = now(), via = 'code';
  perform private.add_event(v_uid, case when v_hash is null then 'code-created' else 'code-changed' end);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.verify_creator_code(p_code text)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := private.session_id();
  v_hash text;
  v_wrong integer;
begin
  if v_uid is null or v_sid is null or not private.has_role(v_uid, 'creator') then raise exception 'Only the Creator can do this.'; end if;
  if not private.is_aal2() then raise exception 'Finish two-step sign-in first.'; end if;

  v_wrong := private.recent_events(v_uid, 'code-wrong', 15) + private.recent_events(v_uid, 'key-wrong', 15);
  if v_wrong >= 5 then
    return jsonb_build_object('ok', false, 'locked', true, 'error', 'Too many wrong tries. Try again in 15 minutes, or use a recovery key.');
  end if;

  select code_hash into v_hash from public.creator_access where user_id = v_uid;
  if v_hash is null then return jsonb_build_object('ok', false, 'error', 'No access code has been set yet.'); end if;

  if crypt(coalesce(p_code, ''), v_hash) = v_hash then
    insert into public.creator_sessions (session_id, user_id, via) values (v_sid, v_uid, 'code')
    on conflict (session_id) do update set last_used_at = now(), via = 'code', verified_at = now();
    perform private.add_event(v_uid, 'code-ok');
    return jsonb_build_object('ok', true);
  end if;

  perform private.add_event(v_uid, 'code-wrong');
  return jsonb_build_object('ok', false, 'attempts_left', greatest(0, 4 - v_wrong),
                            'error', 'That code is not right.');
end;
$$;

-- A recovery key works once. It lets the Creator back in when the code or the
-- authenticator device is lost; the session it opens is a "recovery" session.
create or replace function public.use_recovery_key(p_key text)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := private.session_id();
  v_wrong integer;
  v_key public.creator_recovery_keys;
begin
  if v_uid is null or v_sid is null or not private.has_role(v_uid, 'creator') then raise exception 'Only the Creator can do this.'; end if;

  v_wrong := private.recent_events(v_uid, 'code-wrong', 15) + private.recent_events(v_uid, 'key-wrong', 15);
  if v_wrong >= 5 then
    return jsonb_build_object('ok', false, 'locked', true, 'error', 'Too many wrong tries. Try again in 15 minutes.');
  end if;

  for v_key in select * from public.creator_recovery_keys where user_id = v_uid and used_at is null loop
    if crypt(upper(btrim(coalesce(p_key, ''))), v_key.key_hash) = v_key.key_hash then
      update public.creator_recovery_keys set used_at = now() where id = v_key.id;
      insert into public.creator_sessions (session_id, user_id, via) values (v_sid, v_uid, 'recovery')
      on conflict (session_id) do update set last_used_at = now(), via = 'recovery', verified_at = now();
      perform private.add_event(v_uid, 'recovery-used');
      perform private.log_activity(v_uid, 'recovery-key-used', 'user', v_uid, v_uid, null, '{}'::jsonb);
      insert into public.notifications (user_id, body, kind, data)
      values (v_uid, 'A recovery key was just used to open the Creator panel. If that was not you, create new keys and change the access code now.',
              'security-alert', '{}'::jsonb);
      return jsonb_build_object('ok', true,
        'keys_left', (select count(*) from public.creator_recovery_keys where user_id = v_uid and used_at is null));
    end if;
  end loop;

  perform private.add_event(v_uid, 'key-wrong');
  return jsonb_build_object('ok', false, 'error', 'That key is not right, or was already used.');
end;
$$;

-- Makes a fresh set of 6 one-time keys and replaces any unused ones. The
-- plain keys are returned ONCE; only hashes are stored.
create or replace function public.create_recovery_keys()
returns text[]
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_keys text[] := '{}';
  v_key text;
  i integer;
begin
  if v_uid is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  delete from public.creator_recovery_keys where user_id = v_uid and used_at is null;
  for i in 1..6 loop
    v_key := 'AOE-RK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-'
                      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-'
                      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    insert into public.creator_recovery_keys (user_id, key_hash) values (v_uid, crypt(v_key, gen_salt('bf')));
    v_keys := v_keys || v_key;
  end loop;
  perform private.add_event(v_uid, 'keys-created');
  return v_keys;
end;
$$;

-- Puts the panel back behind the code now.
create or replace function public.lock_creator_panel()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.creator_sessions where session_id = private.session_id() and user_id = auth.uid();
$$;

create or replace function public.creator_security_events_list()
returns table (at timestamptz, kind text)
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  return query select e.at, e.kind from public.creator_security_events e where e.user_id = auth.uid() order by e.id desc limit 25;
end;
$$;

create or replace function public.get_hub_settings()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(false) then raise exception 'Unlock the Creator panel first.'; end if;
  return coalesce((select jsonb_object_agg(key, value) from public.hub_settings), '{}'::jsonb);
end;
$$;

create or replace function public.set_hub_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if p_key = 'require_2fa_staff' then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'That setting is on or off.'; end if;
  elsif p_key = 'upload_daily_files' then
    if jsonb_typeof(p_value) <> 'number' or (p_value)::numeric < 0 or (p_value)::numeric > 1000000 or (p_value)::numeric <> trunc((p_value)::numeric) then
      raise exception 'Use a whole number of files between 0 and 1,000,000.';
    end if;
  elsif p_key = 'upload_daily_bytes' then
    if jsonb_typeof(p_value) <> 'number' or (p_value)::numeric < 0 or (p_value)::numeric > 10000000000000 or (p_value)::numeric <> trunc((p_value)::numeric) then
      raise exception 'Use a size between 0 and 10 TB.';
    end if;
  elsif p_key = 'upload_max_file_bytes' then
    if jsonb_typeof(p_value) <> 'number' or (p_value)::numeric < 1048576 or (p_value)::numeric > 2146435072 or (p_value)::numeric <> trunc((p_value)::numeric) then
      raise exception 'Use a size between 1 MB and 2 GB (the scanner cannot check more).';
    end if;
  else
    raise exception 'Unknown setting.';
  end if;
  insert into public.hub_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null,
                               jsonb_build_object('key', p_key, 'value', p_value));
end;
$$;

