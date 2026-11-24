-- AOE-SEC-08: the AI never quotes a trashed post/comment or one by a suspended or deleted
-- account, even before the index catches up. Safe to run more than once.

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
    -- Never a passage whose post or comment was trashed, or whose author is no longer
    -- active, even before the next index run removes it (AOE-SEC-08).
    and case d.source_type
      when 'file-post' then exists (select 1 from public.file_posts f
                                     where f.id = d.source_id and f.deleted_at is null and private.author_is_active(f.author_id))
      when 'experience-post' then exists (select 1 from public.experience_posts e
                                     where e.id = d.source_id and e.deleted_at is null and private.author_is_active(e.author_id))
      when 'community-answer' then exists (select 1 from public.comments cm
                                     where cm.id = d.source_id and cm.deleted_at is null and private.author_is_active(cm.author_id))
      else true
    end
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke execute on function public.match_kb_chunks(vector, integer, text) from public, anon, authenticated;
grant execute on function public.match_kb_chunks(vector, integer, text) to service_role;
