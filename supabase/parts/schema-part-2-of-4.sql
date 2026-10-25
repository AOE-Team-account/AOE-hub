-- AOEhub database setup, part 2 of 4. Run the parts in order (1, 2, 3 ...). Each part is safe to run again.

-- ============================================================================
-- View and download counters (there are no points; these are plain counts)
-- ============================================================================

-- Dedup table for "one counted view per person per day": a row here means that
-- viewer already counted for that content today.
create table if not exists public.post_views (
  target_type text not null,
  target_id uuid not null,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_on date not null default current_date,
  primary key (target_type, target_id, viewer_id, viewed_on)
);

-- Call this from the app whenever a signed-in user opens a file or
-- experience post. Silently no-ops on a duplicate same-day view.
create or replace function public.record_view(
  p_target_type text,
  p_target_id uuid,
  p_viewer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_new_view_today boolean;
begin
  -- The counter only moves for a genuinely new view (this viewer, this
  -- content, today), not on every page load or refresh.
  insert into public.post_views (target_type, target_id, viewer_id)
  values (p_target_type, p_target_id, p_viewer_id)
  on conflict do nothing
  returning true into is_new_view_today;

  if not coalesce(is_new_view_today, false) then
    return;
  end if;

  if p_target_type = 'file' then
    update public.file_posts set views = views + 1 where id = p_target_id;
  elsif p_target_type = 'experience-post' then
    update public.experience_posts set views = views + 1 where id = p_target_id;
  else
    raise exception 'record_view: unsupported target_type %', p_target_type;
  end if;
end;
$$;

-- Call this from the app when a signed-in user downloads a file asset.
create or replace function public.record_download(p_asset_id uuid, p_downloader_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_new_today boolean;
begin
  -- One counted download per person per file per day, so scripted repeat
  -- downloads cannot inflate the counter. (Server-only function.)
  insert into public.post_views (target_type, target_id, viewer_id)
  values ('download', p_asset_id, p_downloader_id)
  on conflict do nothing
  returning true into is_new_today;
  if not coalesce(is_new_today, false) then
    return;
  end if;

  update public.file_assets set downloads = downloads + 1 where id = p_asset_id;
end;
$$;

-- Points were removed from the hub (2026-10-25). On a database that still has
-- them, take them away: the earning triggers, the functions, the ledger and
-- the balance column. Nothing here runs on a fresh install.
drop trigger if exists comments_award_points on public.comments;
drop trigger if exists file_posts_award_remix_points on public.file_posts;
drop function if exists public.award_points_for_comment();
drop function if exists public.award_points_for_remix();
drop function if exists public.award_points(uuid, integer, text, text, uuid);
drop table if exists public.points_events cascade;
alter table public.profiles drop column if exists points;

-- ============================================================================
-- Notifications
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  kind text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id, read);

-- Generic notification payload (event type is `kind`; details go here), so
-- order, payout and report events can use the same table later.
alter table public.notifications add column if not exists data jsonb not null default '{}'::jsonb;

-- ============================================================================
-- RAG knowledge base (Phase 6 uses these; created now since pgvector needs
-- to be enabled anyway, and the shape is settled)
-- ============================================================================

create table if not exists public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('philosophy-text', 'community-answer', 'file-post', 'experience-post', 'hub-guide')),
  source_id uuid,
  title text,
  content text not null,
  created_at timestamptz not null default now()
);

-- 768 dimensions: the hub's fixed embedding size (Phase 5). Chosen because
-- it's the native size of common local models (nomic-embed-text) AND a size
-- the big commercial embedders can be asked to produce, so the embedding
-- model can be swapped without altering this column. Each chunk records
-- which model made it (embedding_model) — vectors from different models are
-- not comparable, so a model swap means re-indexing, never mixing.
create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(768),
  embedding_model text,
  created_at timestamptz not null default now()
);

-- Existing projects created this table at 1536 dimensions in Phase 2 (it has
-- never held data). Bring it to 768 idempotently; a no-op once it matches.
do $$
begin
  if (select atttypmod from pg_attribute
        where attrelid = 'public.kb_chunks'::regclass and attname = 'embedding') <> 768 then
    drop index if exists public.kb_chunks_embedding_idx;
    delete from public.kb_chunks;
    alter table public.kb_chunks alter column embedding type vector(768);
  end if;
end $$;

alter table public.kb_chunks add column if not exists embedding_model text;

-- HNSW rather than IVFFlat: IVFFlat picks its clusters from the rows present
-- when the index is built, so building it on an empty table gives poor
-- recall forever. HNSW has no such training step.
drop index if exists public.kb_chunks_embedding_idx;
create index if not exists kb_chunks_embedding_hnsw_idx on public.kb_chunks
  using hnsw (embedding vector_cosine_ops);
create index if not exists kb_chunks_document_id_idx on public.kb_chunks (document_id);

-- Phase 5 additions to kb_documents: a hash of the indexed text (so unchanged
-- posts are never re-embedded), and a 'hub-guide' source type for the built-in
-- "how the hub works" text.
alter table public.kb_documents add column if not exists content_hash text;
alter table public.kb_documents drop constraint if exists kb_documents_source_type_check;
update public.kb_documents set source_type = source_type where false;
delete from public.kb_documents where source_type = 'admin-answer';
alter table public.kb_documents add constraint kb_documents_source_type_check
  check (source_type in ('philosophy-text', 'community-answer', 'file-post', 'experience-post', 'hub-guide'));
create unique index if not exists kb_documents_source_uniq
  on public.kb_documents (source_type, source_id) where source_id is not null;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.file_posts enable row level security;
alter table public.file_assets enable row level security;
alter table public.experience_posts enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.post_views enable row level security;
alter table public.notifications enable row level security;
alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;

-- profiles: readable by everyone (public profile pages); only the owner
-- can update their own row (counters are function/trigger
-- managed, not client-writable — see the column grants below).
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable" on public.profiles
  for select using (account_status = 'active' or auth.uid() = id or private.is_reviewer(auth.uid()));

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke update (followers_count, following_count, files_count, member_since)
  on public.profiles from authenticated;

-- follows: readable by everyone; only the follower can create/delete their
-- own follow rows.
drop policy if exists "follows are publicly readable" on public.follows;
create policy "follows are publicly readable" on public.follows for select using (true);

drop policy if exists "users manage their own follows" on public.follows;
create policy "users manage their own follows" on public.follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- File Board: browsing is always free (even logged-out/anon), per the
-- access model. Writes require auth; only the author may
-- update/delete their own posts.
drop policy if exists "file posts are publicly readable" on public.file_posts;
create policy "file posts are publicly readable" on public.file_posts
  for select using (deleted_at is null and private.author_is_active(author_id));

-- Reviewers also see content of suspended accounts (hidden from everyone
-- else); the trash stays Creator-only through list_trash().
drop policy if exists "reviewers see hidden members' files" on public.file_posts;
create policy "reviewers see hidden members' files" on public.file_posts
  for select using (deleted_at is null and private.reviewer_can(auth.uid(), 'file', 'view'));

drop policy if exists "signed-in users can post files" on public.file_posts;
create policy "signed-in users can post files" on public.file_posts
  for insert with check (auth.uid() = author_id and private.can_participate(auth.uid()));

-- Reviewers never edit or hard-delete members' posts directly: they act
-- through soft_delete_item() (trash, reason, log), so only authors appear here.
drop policy if exists "authors and admins can update file posts" on public.file_posts;
drop policy if exists "authors can update file posts" on public.file_posts;
create policy "authors can update file posts" on public.file_posts
  for update using (auth.uid() = author_id);

drop policy if exists "authors and admins can delete file posts" on public.file_posts;
drop policy if exists "authors can delete file posts" on public.file_posts;
create policy "authors can delete file posts" on public.file_posts
  for delete using (auth.uid() = author_id);

-- Per project memory: "flagged files get quarantined automatically, never
-- shown publicly." Only clean assets are visible to everyone; the
-- uploader can still see their own pending/flagged assets (so they get
-- feedback on what happened), and reviewers can see everything for moderation.
drop policy if exists "clean file assets are publicly readable" on public.file_assets;
create policy "clean file assets are publicly readable" on public.file_assets
  for select using (
    (scan_status = 'clean'
       and exists (select 1 from public.file_posts where id = file_post_id and deleted_at is null))
    or exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid() and deleted_at is null)
    or private.reviewer_can(auth.uid(), 'file', 'view')
  );

drop policy if exists "post authors manage their file assets" on public.file_assets;
create policy "post authors manage their file assets" on public.file_assets
  for all using (
    exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid())
  ) with check (
    exists (select 1 from public.file_posts where id = file_post_id and author_id = auth.uid())
    and private.can_participate(auth.uid())
  );

-- Experience Board: same public-read / authed-write shape. The
-- announcement_author_must_be_creator trigger (above) is the real guard on
-- is_announcement; this policy just gates writes to signed-in users.
drop policy if exists "experience posts are publicly readable" on public.experience_posts;
create policy "experience posts are publicly readable" on public.experience_posts
  for select using (deleted_at is null and private.author_is_active(author_id));

drop policy if exists "reviewers see hidden members' posts" on public.experience_posts;
create policy "reviewers see hidden members' posts" on public.experience_posts
  for select using (deleted_at is null and private.reviewer_can(auth.uid(), 'post', 'view'));

drop policy if exists "signed-in users can post experiences" on public.experience_posts;
create policy "signed-in users can post experiences" on public.experience_posts
  for insert with check (auth.uid() = author_id and private.can_participate(auth.uid()));

drop policy if exists "authors and admins can update experience posts" on public.experience_posts;
drop policy if exists "authors can update experience posts" on public.experience_posts;
create policy "authors can update experience posts" on public.experience_posts
  for update using (auth.uid() = author_id);

drop policy if exists "authors and admins can delete experience posts" on public.experience_posts;
drop policy if exists "authors can delete experience posts" on public.experience_posts;
create policy "authors can delete experience posts" on public.experience_posts
  for delete using (auth.uid() = author_id);

-- Comments: everything on the hub is public (Groups, the only private space,
-- was removed), so comments on files and posts are readable by everyone.
drop policy if exists "comments are readable per parent visibility" on public.comments;
drop policy if exists "comments are publicly readable" on public.comments;
create policy "comments are publicly readable" on public.comments
  for select using (deleted_at is null and private.author_is_active(author_id));

drop policy if exists "reviewers see hidden members' comments" on public.comments;
create policy "reviewers see hidden members' comments" on public.comments
  for select using (deleted_at is null and private.reviewer_can(auth.uid(), 'comment', 'view'));

drop policy if exists "signed-in users can comment" on public.comments;
create policy "signed-in users can comment" on public.comments
  for insert with check (
    auth.uid() = author_id
    and parent_type in ('file', 'experience-post')
    and private.can_participate(auth.uid())
  );

drop policy if exists "authors and admins can delete comments" on public.comments;
drop policy if exists "authors can delete comments" on public.comments;
create policy "authors can delete comments" on public.comments
  for delete using (auth.uid() = author_id);

-- Nothing calls these any more (the comment policies above were the last
-- users), so they can finally go. Must stay below those policies.
drop function if exists public.is_group_member(uuid, uuid);
drop function if exists public.group_member_count(uuid);

-- Reports: anyone signed in can file one; reviewers read them per the
-- permission table (see below).
drop policy if exists "signed-in users can file reports" on public.reports;
create policy "signed-in users can file reports" on public.reports
  for insert with check (auth.uid() = reported_by);

-- Who sees which reports comes from the permission table: Watchers and the
-- Creator see post, comment and file reports; Deacons post and comment
-- reports; account reports go to the Creator. Settling a report goes through
-- dismiss_report() / soft_delete_item(), so there is no update policy.
drop policy if exists "admins manage reports" on public.reports;
drop policy if exists "reviewers read reports in their scope" on public.reports;
create policy "reviewers read reports in their scope" on public.reports
  for select using (private.reviewer_can(auth.uid(), private.report_kind(target_type), 'view'));

drop policy if exists "admins update reports" on public.reports;

-- post_views: written only via record_view() (SECURITY DEFINER). No
-- client-facing policies needed at all.

-- notifications: strictly private to the recipient.
drop policy if exists "users see their own notifications" on public.notifications;
create policy "users see their own notifications" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "users can mark their notifications read" on public.notifications;
create policy "users can mark their notifications read" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- kb_documents / kb_chunks: no client policies at all — the RAG pipeline
-- (Phase 6) reads/writes these with the service role key from a trusted
-- server context only, never from the browser.

-- ============================================================================
-- Phase 5 — RAG AI
-- ============================================================================

-- Vault: Supabase's built-in encrypted secret storage. Member-supplied AI
-- API keys live here, never in a plain column (see set_my_ai_key below).
create extension if not exists supabase_vault;

-- ---- Keep the knowledge base in step with the boards ----------------------

-- When a post is deleted (by its author, a reviewer, or a cascade from a
-- banned/deleted account) its knowledge-base copy must disappear with it, so
-- the AI can never quote content that has been removed. kb_documents has no
-- client policies, hence SECURITY DEFINER.
create or replace function public.remove_kb_document_for_deleted_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents
   where source_id = old.id
     and source_type = case tg_table_name when 'file_posts' then 'file-post' else 'experience-post' end;
  return old;
end;
$$;

drop trigger if exists file_posts_remove_kb on public.file_posts;
create trigger file_posts_remove_kb after delete on public.file_posts
  for each row execute function public.remove_kb_document_for_deleted_post();

drop trigger if exists experience_posts_remove_kb on public.experience_posts;
create trigger experience_posts_remove_kb after delete on public.experience_posts
  for each row execute function public.remove_kb_document_for_deleted_post();

-- ---- Similarity search -----------------------------------------------------

-- Only chunks made by the CURRENT embedding model are searchable (vectors
-- from different models aren't comparable). Callable by the server with the
-- service role only — the chat route is the sole caller.
create or replace function public.match_kb_chunks(
  query_embedding vector(768),
  match_count integer,
  p_model text
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_type text,
  source_id uuid,
  title text,
  content text,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select c.id, c.document_id, d.source_type, d.source_id, d.title, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  where c.embedding_model = p_model and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke execute on function public.match_kb_chunks(vector, integer, text) from public, anon, authenticated;
grant execute on function public.match_kb_chunks(vector, integer, text) to service_role;

-- ---- Free-AI-key help (editable data; the steps change often) --------------
-- One row per service we point members to, per region. The Creator edits the
-- text in the Hub tab; nothing here is hard-coded in the app. Seeded once
-- ("do nothing" on conflict), so re-running this file never undoes an edit.
-- Steps for Alibaba, Zhipu and SiliconFlow follow their own documentation as
-- read on 2026-10-16; Google's and Groq's come from Google's general key
-- instructions and third-party guides and must be re-checked before launch.
create table if not exists public.ai_key_help (
  provider_id text primary key,
  region text not null check (region in ('china', 'world')),
  title text not null,
  steps text[] not null default '{}',
  note text,
  link_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.ai_key_help (provider_id, region, title, steps, note, link_url, sort_order) values
  ('qwen-cn', 'china', 'Qwen (Alibaba Cloud Model Studio, mainland China)',
   array['Open Alibaba Cloud Model Studio (also called Bailian) and sign up or log in.',
         'Turn on Model Studio and agree to its terms. New accounts may get a free starting amount; check the console.',
         'Open the API Key page, choose your region in the top-right corner, and press Create API Key. A key only works in the region it was made in: if you chose mainland China pick "Qwen (mainland China)" here, if you chose the international region pick "Qwen (international)".',
         'Copy the key straight away (it cannot be shown again) and paste it in the box here.'],
   'The free starting amount lasts a limited time. When it runs out the service asks you to verify your identity and add funds before it continues.',
   'https://bailian.console.aliyun.com/', 10),
  ('qwen-intl', 'china', 'Qwen (Alibaba Cloud Model Studio, international / Singapore)',
   array['Open Alibaba Cloud (alibabacloud.com), press Sign Up at the top right (or Log In), register with your email and follow the verification steps, then sign in.',
         'Open your Account Information page and fill in what it asks for.',
         'Open Alibaba Cloud Model Studio and, in the top-right corner, make sure the region says Singapore. Do not choose Beijing or Virginia: the free quota only applies to Singapore.',
         'If a service agreement appears, read it, tick the box and accept it. Your free quota is added automatically; you do not need to buy or claim anything.',
         'Open the API Key page and press Create API Key. Choose Default Workspace, type a description such as "My Qwen key", set Permissions to All, and press OK.',
         'Press Copy in the success window and save the key somewhere private before you close it: it cannot be shown in full again. It looks like sk-ws-… (the window also shows an API Host address; the hub already knows the right one).',
         'Before you use the key, open Free Quota settings, stay on the Free Quota tab, press "Free Quota Only Batch Operation", choose Batch Enable, press "Enable for All Models" and confirm. This makes the models stop answering when the free quota runs out instead of charging you. It can take a little while to apply.',
         'Back here, pick "Qwen (international)" and paste the key in the box.'],
   'Written from Clara''s instructions (2026-10-17). Turn on "Free Quota Only" before using the key, otherwise usage after the free quota can be charged. Pick "Qwen (international)" here, because this key was made in the Singapore region.',
   'https://modelstudio.console.alibabacloud.com/ap-southeast-1', 11),
  ('zhipu', 'china', 'Zhipu GLM (bigmodel.cn)',
   array['Open open.bigmodel.cn and press register / log in.',
         'After logging in, open your personal center and the API Keys page.',
         'Create a new API key.',
         'Copy it and paste it in the box here.'],
   'Check Zhipu''s model page for which models are free and what the limits are; they change.',
   'https://open.bigmodel.cn/', 20),
  ('siliconflow', 'china', 'SiliconFlow',
   array['Open SiliconFlow and sign in with your phone number or email.',
         'In the console open the API keys page and press the new-key button.',
         'Copy the key and paste it in the box here.'],
   'Check SiliconFlow''s model list for which models are free and whether new accounts get credit.',
   'https://cloud.siliconflow.cn/', 30),
  ('google', 'world', 'Google AI Studio',
   array['Search "aistudio.google.com", open Google AI Studio and sign in with the Google account you want to use.',
         'On the left side, near the bottom just above your profile, there are four small buttons. Press the fourth one, the one with a key picture. It opens the API keys area.',
         'If you are signed in, a key may already have been made for you. Press "Copy API key" and paste it in the box here.',
         'Or make your own: press "Create API key" at the top right, give it a name, choose a project, press create, then copy it and paste it in the box here.'],
   'Written from Clara''s own walk-through on a Mac with Chrome (2026-10-17); other browsers may look a little different. Google AI Studio is not available in some places, including mainland China. The free plan has daily limits, and Google may use what you send it on the free plan, so avoid sharing private details.',
   'https://aistudio.google.com/apikey', 10),
  ('groq', 'world', 'Groq (GroqCloud)',
   array['Search "console.groq.com" (or "groq free api key" and open "API keys - GroqCloud") and sign in with your email.',
         'At the top right you will see your profile, Settings, Docs, Dashboard, API keys and Playground. Press "API keys".',
         'Press "Create API key" at the top right and give it a name. You can also set when it expires: never, or any date that suits you.',
         'A short Cloudflare check runs, then the create button appears. Press it, and the key is shown.',
         'Copy the key straight away and save it somewhere: it is shown only once. Paste it in the box here.'],
   'Written from Clara''s own walk-through on a Mac with Chrome (2026-10-17). The free plan has daily limits, so heavy use can run out.',
   'https://console.groq.com/keys', 20)
on conflict (provider_id) do nothing;

alter table public.ai_key_help enable row level security;
drop policy if exists "key help is public" on public.ai_key_help;
create policy "key help is public" on public.ai_key_help for select using (active);

-- Creator only: edit one entry (steps, note, on/off).
create or replace function public.set_ai_key_help(p_provider_id text, p_steps text[], p_note text, p_active boolean)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if p_steps is null or array_length(p_steps, 1) is null or array_length(p_steps, 1) > 12 then raise exception 'Give between 1 and 12 steps.'; end if;
  update public.ai_key_help
     set steps = p_steps, note = nullif(btrim(coalesce(p_note, '')), ''), active = coalesce(p_active, active), updated_at = now()
   where provider_id = p_provider_id;
  if not found then raise exception 'Unknown service.'; end if;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'ai_key_help:' || p_provider_id));
end;
$$;

-- Creator only: read every entry including switched-off ones.
create or replace function public.list_ai_key_help()
returns setof public.ai_key_help
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(false) then raise exception 'Unlock the Creator panel first.'; end if;
  return query select * from public.ai_key_help order by region, sort_order;
end;
$$;

-- ---- Which embedding model has indexed which document -----------------------
-- A model name, not a single flag, so two models can be maintained side by
-- side while the library is re-embedded ("re-embed, verify, cut over, clean
-- up" — never an instant swap). Chunks carry the model that made them;
-- the live model is chosen in hub_settings (embedding_model_live) and only
-- chunks from it are searched. A document with a row here for a model has
-- EVERY chunk embedded for that model.
create table if not exists public.kb_document_models (
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  model text not null,
  completed_at timestamptz not null default now(),
  primary key (document_id, model)
);
alter table public.kb_document_models enable row level security;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kb_documents' and column_name = 'indexed_model') then
    execute 'insert into public.kb_document_models (document_id, model) select id, indexed_model from public.kb_documents where indexed_model is not null on conflict do nothing';
    execute 'alter table public.kb_documents drop column indexed_model';
  end if;
end $$;

create or replace function public.kb_pending_documents(p_model text, p_limit integer default 1)
returns table (id uuid, title text, content text)
language sql
security definer
stable
set search_path = public
as $$
  select d.id, d.title, d.content
    from public.kb_documents d
   where not exists (select 1 from public.kb_document_models m where m.document_id = d.id and m.model = p_model)
   order by d.created_at, d.id
   limit greatest(p_limit, 1);
$$;

create or replace function public.kb_pending_count(p_model text)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.kb_documents d
   where not exists (select 1 from public.kb_document_models m where m.document_id = d.id and m.model = p_model);
$$;

-- Deletes the AI's data made by any model NOT in the keep list (the "clean
-- up" step, run only after a cut-over has been checked). Returns chunks removed.
create or replace function public.kb_cleanup_models(p_keep text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  delete from public.kb_chunks where embedding_model is null or embedding_model <> all (p_keep);
  get diagnostics v_n = row_count;
  delete from public.kb_document_models where model <> all (p_keep);
  return v_n;
end;
$$;

-- Which of the hub's AI providers is resting after hitting a limit, so the
-- answer/translation AI can fall back (Gemini first, then Groq) and return.
create table if not exists public.ai_provider_state (
  provider text primary key,
  rested_until timestamptz,
  strikes integer not null default 0,
  last_error text,
  last_ok_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_state enable row level security;

-- ============================================================================
-- Translation (Step 6a). Three written languages (English, Simplified and
-- Traditional Chinese) live in the app's files. Every other language is added
-- by AI and kept here; posts, comments and notices are translated on demand
-- and remembered so the same text is never translated twice.
-- All of these are reached only by the server (service role).
-- ============================================================================

create table if not exists public.ui_languages (
  code text primary key check (code ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  english_name text not null,
  native_name text not null,
  status text not null default 'building' check (status in ('building', 'ready', 'failed')),
  done_keys integer not null default 0,
  total_keys integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.ui_languages enable row level security;

create table if not exists public.ui_strings (
  lang text not null references public.ui_languages (code) on delete cascade,
  key text not null,
  value text not null,
  primary key (lang, key)
);
alter table public.ui_strings enable row level security;

-- One row per translated field of a post, comment, notice or notification.
-- source_hash changes when the author edits the text, which makes the row
-- stale. translated is NULL when the text is already in the target language.
create table if not exists public.content_translations (
  item_type text not null check (item_type in ('experience-post', 'file', 'comment', 'notice', 'notification')),
  item_id text not null,
  field text not null,
  target_lang text not null,
  source_hash text not null,
  source_lang text,
  translated text,
  method text not null check (method in ('opencc', 'ai', 'same')),
  created_at timestamptz not null default now(),
  primary key (item_type, item_id, field, target_lang)
);
alter table public.content_translations enable row level security;

-- Daily counters behind the translation caps. kind: 'content' (posts etc.),
-- 'ui' (interface strings of a new language), 'language' (languages added).
create table if not exists public.translation_usage (
  day date not null,
  kind text not null,
  used integer not null default 0,
  primary key (day, kind)
);
alter table public.translation_usage enable row level security;

-- Takes p_n units from today's allowance for p_kind. Returns false (and takes
-- nothing) if that would go over p_cap. Atomic, so parallel requests cannot
-- jointly overspend.
create or replace function public.take_translation_budget(p_kind text, p_n integer, p_cap integer)
returns boolean
language plpgsql
volatile
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into public.translation_usage (day, kind, used) values (current_date, p_kind, 0)
  on conflict (day, kind) do nothing;
  update public.translation_usage set used = used + p_n
   where day = current_date and kind = p_kind and used + p_n <= p_cap
  returning used into v_used;
  return v_used is not null;
end;
$$;

-- Gives back unused units (a request that failed after taking them).
create or replace function public.refund_translation_budget(p_kind text, p_n integer)
returns void
language sql
volatile
set search_path = public
as $$
  update public.translation_usage set used = greatest(0, used - p_n) where day = current_date and kind = p_kind;
$$;

-- A translation is deleted together with the text it translates (promised in
-- the Terms and Privacy Policy). Notices are keyed "<kind>:<item id>".
create or replace function private.drop_translations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if tg_argv[0] = 'notice' then
    v_id := old.item_kind || ':' || old.item_id::text;
  else
    v_id := old.id::text;
  end if;
  delete from public.content_translations where item_type = tg_argv[0] and item_id = v_id;
  return old;
end;
$$;

drop trigger if exists drop_translations_experience on public.experience_posts;
create trigger drop_translations_experience after delete on public.experience_posts
  for each row execute function private.drop_translations('experience-post');
drop trigger if exists drop_translations_file on public.file_posts;
create trigger drop_translations_file after delete on public.file_posts
  for each row execute function private.drop_translations('file');
drop trigger if exists drop_translations_comment on public.comments;
create trigger drop_translations_comment after delete on public.comments
  for each row execute function private.drop_translations('comment');
drop trigger if exists drop_translations_notification on public.notifications;
create trigger drop_translations_notification after delete on public.notifications
  for each row execute function private.drop_translations('notification');
drop trigger if exists drop_translations_notice on public.item_notices;
create trigger drop_translations_notice after delete on public.item_notices
  for each row execute function private.drop_translations('notice');

insert into public.hub_settings (key, value) values
  ('translation_daily_cap', '2000'::jsonb),
  ('new_language_daily_cap', '3'::jsonb),
  ('max_ai_languages', '30'::jsonb)
on conflict (key) do nothing;

-- ---- Questions: "I don't know" posts a question to the Experience Board ----
-- (Replaces the admin inbox, chat5/6.) A question is an ordinary Experience
-- Board post in the "question" category. Current Verified members and
-- Answerers are told a question needs an answer; the asker is told about
-- every comment. Only answers from a current Answerer or Verified member
-- feed the AI (see the indexer), and they leave the AI's data the moment they
-- are deleted, hidden or no longer eligible.

-- The old admin inbox and everything that served it.
do $$
begin
  -- Only when the old table is still there (a database from before this
  -- change). Written with EXECUTE so nothing here names the table until it is
  -- known to exist; dropping the table also drops its triggers and policies.
  if to_regclass('public.admin_questions') is not null then
    execute 'drop table public.admin_questions cascade';
  end if;
end $$;
drop function if exists public.limit_open_admin_questions();
drop function if exists public.remove_kb_document_for_deleted_question();
drop function if exists public.retract_admin_answer(uuid);
drop function if exists public.answer_admin_question(uuid, text);
delete from public.kb_documents where source_type = 'admin-answer';

alter table public.experience_posts drop constraint if exists experience_posts_category_check;
alter table public.experience_posts add constraint experience_posts_category_check
  check (category in ('philosophy', 'starting-out', 'milestones', 'struggles', 'curriculum-reviews', 'reflections', 'just-sharing', 'question'));

create or replace function private.limit_daily_questions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.experience_posts
       where author_id = new.author_id and category = 'question' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can post up to 5 questions a day. Please try again tomorrow.';
  end if;
  return new;
end;
$$;

drop trigger if exists experience_posts_question_limit on public.experience_posts;
create trigger experience_posts_question_limit before insert on public.experience_posts
  for each row when (new.category = 'question') execute function private.limit_daily_questions();

create or replace function private.notify_question_asked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, body, kind, data)
  select distinct r.user_id,
         'A question needs an answer: "' || left(coalesce(nullif(new.title, ''), new.body), 120) || '"',
         'question-asked', jsonb_build_object('post_id', new.id)
    from public.user_roles r
    join public.profiles p on p.id = r.user_id and p.account_status = 'active'
   where r.role in ('answerer', 'verified') and r.user_id <> new.author_id;
  return new;
end;
$$;

drop trigger if exists experience_posts_question_notify on public.experience_posts;
create trigger experience_posts_question_notify after insert on public.experience_posts
  for each row when (new.category = 'question') execute function private.notify_question_asked();

create or replace function private.notify_question_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asker uuid;
  v_category text;
begin
  -- A reply to a comment is part of a conversation, not a new answer.
  if new.parent_comment_id is not null then return new; end if;
  if new.parent_type <> 'experience-post' then return new; end if;
  select author_id, category into v_asker, v_category from public.experience_posts where id = new.parent_id;
  if v_category = 'question' and v_asker is not null and v_asker <> new.author_id then
    insert into public.notifications (user_id, body, kind, data)
    values (v_asker, 'Someone answered your question.', 'question-answered',
            jsonb_build_object('post_id', new.parent_id, 'comment_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists comments_question_answered on public.comments;
create trigger comments_question_answered after insert on public.comments
  for each row execute function private.notify_question_answered();

-- ---- Replies to comments ----
-- A reply is a comment whose parent_comment_id points at another comment. One
-- level only: the parent must be a top-level comment on the SAME post or file,
-- and not deleted. Who may reply is decided by the same insert policy as for
-- comments (signed in, active, not restricted), so a member who cannot comment
-- cannot reply either.
create or replace function private.check_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if new.parent_comment_id is null then return new; end if;
  select parent_type, parent_id, parent_comment_id, deleted_at, type into p
    from public.comments where id = new.parent_comment_id;
  if not found or p.deleted_at is not null
     or p.parent_type <> new.parent_type or p.parent_id <> new.parent_id
     or p.parent_comment_id is not null then
    raise exception 'You can only reply to a comment on this post.';
  end if;
  new.type := p.type;
  return new;
end;
$$;

drop trigger if exists comments_check_reply on public.comments;
create trigger comments_check_reply before insert on public.comments
  for each row execute function private.check_comment_reply();

-- The writer of a comment is told when someone replies to it.
create or replace function private.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.parent_comment_id is null then return new; end if;
  select author_id into v_owner from public.comments where id = new.parent_comment_id;
  if v_owner is not null and v_owner <> new.author_id and private.author_is_active(v_owner) then
    insert into public.notifications (user_id, body, kind, data)
    values (v_owner, 'Someone replied to your comment.', 'comment-reply',
            jsonb_build_object('post_type', new.parent_type, 'post_id', new.parent_id, 'comment_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists comments_reply_notify on public.comments;
create trigger comments_reply_notify after insert on public.comments
  for each row execute function private.notify_comment_reply();

-- The AI must never quote a community answer that has been deleted, hidden or
-- is no longer eligible. These remove its copy straight away; the indexer
-- also rebuilds the set from the current state on every run.
create or replace function private.drop_kb_for_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents where source_type = 'community-answer' and source_id = p_comment_id;
end;
$$;

create or replace function private.drop_kb_answers_by(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents
   where source_type = 'community-answer'
     and source_id in (select id from public.comments where author_id = p_user);
end;
$$;

create or replace function private.drop_kb_answers_on_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kb_documents
   where source_type = 'community-answer'
     and source_id in (select id from public.comments where parent_type = 'experience-post' and parent_id = p_post_id);
end;
$$;

create or replace function private.comment_deleted_remove_kb()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.drop_kb_for_comment(old.id);
  return old;
end;
$$;

-- Comments point at their post by id only (no foreign key, because a comment
-- can sit on either board), so deleting a post must remove its comments
-- itself — which also fires the trigger above for each answer.
create or replace function private.delete_comments_of_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.comments
   where parent_id = old.id
     and parent_type = case tg_table_name when 'file_posts' then 'file' else 'experience-post' end;
  return old;
end;
$$;

drop trigger if exists experience_posts_delete_comments on public.experience_posts;
create trigger experience_posts_delete_comments after delete on public.experience_posts
  for each row execute function private.delete_comments_of_post();
drop trigger if exists file_posts_delete_comments on public.file_posts;
create trigger file_posts_delete_comments after delete on public.file_posts
  for each row execute function private.delete_comments_of_post();

drop trigger if exists comments_remove_kb on public.comments;
create trigger comments_remove_kb after delete on public.comments
  for each row execute function private.comment_deleted_remove_kb();

-- ---- Bring-your-own AI key -------------------------------------------------

-- The key itself is in Vault; this table only remembers which provider/model
-- and which Vault secret. The browser can read its own row (never the key).
create table if not exists public.user_ai_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('google', 'anthropic', 'openai', 'groq', 'qwen-cn', 'qwen-intl', 'zhipu', 'siliconflow')),
  model text not null check (char_length(model) between 1 and 100),
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.user_ai_settings drop constraint if exists user_ai_settings_provider_check;
alter table public.user_ai_settings add constraint user_ai_settings_provider_check
  check (provider in ('google', 'anthropic', 'openai', 'groq', 'qwen-cn', 'qwen-intl', 'zhipu', 'siliconflow'));

alter table public.user_ai_settings enable row level security;

drop policy if exists "members read their own ai settings" on public.user_ai_settings;
create policy "members read their own ai settings" on public.user_ai_settings
  for select using (auth.uid() = user_id);

-- Whenever a settings row goes away (member removes their key, or their
-- account is deleted and the row cascades) the encrypted secret goes too.
create or replace function public.delete_vault_secret_for_ai_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;

drop trigger if exists user_ai_settings_delete_secret on public.user_ai_settings;
create trigger user_ai_settings_delete_secret after delete on public.user_ai_settings
  for each row execute function public.delete_vault_secret_for_ai_settings();

create or replace function public.set_my_ai_key(p_provider text, p_model text, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_secret uuid;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if p_provider not in ('google', 'anthropic', 'openai', 'groq', 'qwen-cn', 'qwen-intl', 'zhipu', 'siliconflow') then raise exception 'Unsupported provider.'; end if;
  if p_model is null or p_model !~ '^[A-Za-z0-9._:/-]{1,100}$' then raise exception 'Invalid model name.'; end if;
  if p_key is null or char_length(p_key) not between 8 and 512 then raise exception 'Invalid key.'; end if;

  select vault_secret_id into v_existing from public.user_ai_settings where user_id = v_uid;
  if v_existing is not null then
    perform vault.update_secret(v_existing, p_key, 'user_ai_key_' || v_uid::text, 'AOEhub member AI key');
    v_secret := v_existing;
  else
    v_secret := vault.create_secret(p_key, 'user_ai_key_' || v_uid::text, 'AOEhub member AI key');
  end if;

  insert into public.user_ai_settings (user_id, provider, model, vault_secret_id)
  values (v_uid, p_provider, p_model, v_secret)
  on conflict (user_id) do update
    set provider = excluded.provider, model = excluded.model,
        vault_secret_id = excluded.vault_secret_id, updated_at = now();
end;
$$;

create or replace function public.remove_my_ai_key()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_ai_settings where user_id = auth.uid();
$$;

-- Server-only: hands the decrypted key to the chat route for one request.
-- Not callable by browsers under any role except the service role.
create or replace function public.get_user_ai_key(p_user_id uuid)
returns table (provider text, model text, api_key text)
language sql
security definer
stable
set search_path = public
as $$
  select s.provider, s.model, v.decrypted_secret
  from public.user_ai_settings s
  join vault.decrypted_secrets v on v.id = s.vault_secret_id
  where s.user_id = p_user_id;
$$;

revoke execute on function public.set_my_ai_key(text, text, text) from public, anon;
grant execute on function public.set_my_ai_key(text, text, text) to authenticated;
revoke execute on function public.remove_my_ai_key() from public, anon;
grant execute on function public.remove_my_ai_key() to authenticated;
revoke execute on function public.get_user_ai_key(uuid) from public, anon, authenticated;
grant execute on function public.get_user_ai_key(uuid) to service_role;

-- ============================================================================
-- The hub's own AI key pool (Step 7). The Creator adds keys for the hub's
-- answer, translation and search AI in the Creator panel; they are stored
-- encrypted in Supabase Vault, exactly like members' own keys, and can never
-- be shown again — only a label and the last four characters. Keys in the
-- server's settings file keep working alongside these.
-- ============================================================================
create table if not exists public.hub_ai_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google', 'groq', 'qwen-intl', 'qwen-cn')),
  label text not null check (char_length(label) between 1 and 60),
  hint text not null,
  key_hash text not null unique,
  vault_secret_id uuid not null,
  active boolean not null default true,
  sort_order integer generated always as identity,
  created_at timestamptz not null default now(),
  created_by uuid,
  last_check_at timestamptz,
  last_check_ok boolean,
  last_check_note text
);
alter table public.hub_ai_keys enable row level security;

create or replace function public.delete_vault_secret_for_hub_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;

drop trigger if exists hub_ai_keys_delete_secret on public.hub_ai_keys;
create trigger hub_ai_keys_delete_secret after delete on public.hub_ai_keys
  for each row execute function public.delete_vault_secret_for_hub_key();

create or replace function public.add_hub_ai_key(p_provider text, p_label text, p_key text)
returns uuid
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
  v_secret uuid;
  v_hash text;
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  if p_provider not in ('google', 'groq', 'qwen-intl', 'qwen-cn') then raise exception 'Unsupported service.'; end if;
  if p_label is null or char_length(btrim(p_label)) not between 1 and 60 then raise exception 'Give the key a short name (up to 60 characters).'; end if;
  if p_key is null or char_length(p_key) not between 8 and 512 or p_key !~ '^[A-Za-z0-9._~+/=-]+$' then raise exception 'That does not look like an API key.'; end if;
  v_hash := encode(digest(p_key, 'sha256'), 'hex');
  if exists (select 1 from public.hub_ai_keys where key_hash = v_hash) then raise exception 'That key is already in the pool.'; end if;
  v_secret := vault.create_secret(p_key, 'hub_ai_key_' || v_id::text, 'AOEhub hub AI key');
  insert into public.hub_ai_keys (id, provider, label, hint, key_hash, vault_secret_id, created_by)
  values (v_id, p_provider, btrim(p_label), right(p_key, 4), v_hash, v_secret, auth.uid());
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'hub_ai_key_added', 'provider', p_provider, 'label', btrim(p_label)));
  return v_id;
end;
$$;

create or replace function public.set_hub_ai_key_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  update public.hub_ai_keys set active = coalesce(p_active, active) where id = p_id;
  if not found then raise exception 'No such key.'; end if;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'hub_ai_key_active', 'id', p_id, 'active', p_active));
end;
$$;

create or replace function public.remove_hub_ai_key(p_id uuid)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(true) then raise exception 'Unlock the Creator panel first.'; end if;
  delete from public.hub_ai_keys where id = p_id;
  if not found then raise exception 'No such key.'; end if;
  perform private.log_activity(auth.uid(), 'setting-changed', null, null, null, null, jsonb_build_object('key', 'hub_ai_key_removed', 'id', p_id));
end;
$$;

-- Creator panel list: never includes the key itself.
create or replace function public.list_hub_ai_keys()
returns table (id uuid, provider text, label text, hint text, active boolean, created_at timestamptz,
               last_check_at timestamptz, last_check_ok boolean, last_check_note text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not private.creator_unlocked(false) then raise exception 'Unlock the Creator panel first.'; end if;
  return query
    select k.id, k.provider, k.label, k.hint, k.active, k.created_at, k.last_check_at, k.last_check_ok, k.last_check_note
      from public.hub_ai_keys k order by k.sort_order;
end;
$$;

-- Server only (service role): the decrypted keys the AI code uses, active ones
-- first in the order they were added; and the result of a test.
create or replace function public.hub_ai_key_secrets(p_only_active boolean default true)
returns table (id uuid, provider text, label text, api_key text)
language sql
security definer
stable
set search_path = public
as $$
  select k.id, k.provider, k.label, v.decrypted_secret
    from public.hub_ai_keys k
    join vault.decrypted_secrets v on v.id = k.vault_secret_id
   where (not p_only_active or k.active)
   order by k.sort_order;
$$;

create or replace function public.record_hub_ai_key_check(p_id uuid, p_ok boolean, p_note text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.hub_ai_keys set last_check_at = now(), last_check_ok = p_ok, last_check_note = left(p_note, 200) where id = p_id;
$$;

