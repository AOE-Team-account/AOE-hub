import "server-only";
import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { chunkText } from "../chunking";
import { AIProviderError } from "./chat-providers";
import { getLiveEmbeddingModel, getNextEmbeddingModel } from "./embedding-models";
import { embedPassages } from "./embeddings";
import { HUB_GUIDE_SOURCE_ID, HUB_GUIDE_TEXT, HUB_GUIDE_TITLE } from "./hub-guide";

type Db = ReturnType<typeof createServiceRoleClient>;
type SourceType = "file-post" | "experience-post" | "hub-guide" | "community-answer";

interface DesiredDoc {
  source_type: SourceType;
  source_id: string;
  title: string;
  content: string;
}

export interface IndexStatus {
  documents: number;
  /** Documents still to embed for the LIVE model. */
  pendingDocuments: number;
  /** Documents still to embed for the model being built alongside (null: none). */
  pendingNext: number | null;
  liveModel: string;
  nextModel: string | null;
  processedThisRun: number;
  /** True when the provider asked us to slow down; the next run resumes. */
  rateLimited: boolean;
  /** How many seconds the provider asked us to wait before the next run. */
  retryAfterSec: number | null;
  done: boolean;
}

const PAGE = 500;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const SECTION_LABELS: Record<string, string> = {
  curriculum: "Curriculum", games: "Games", books: "Books", cards: "Cards",
  songs: "Songs", art: "Art projects", printables: "Printables", apps: "Apps",
};

async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// Only PUBLIC, CLEAN content is ever indexed. A file post is included only
// once at least one of its files has passed the malware scan; if every file
// is later flagged, the post drops out of the index on the next sync. Items a
// reviewer moved to the trash (deleted_at set) are left out the same way.
async function collectDesiredDocs(db: Db): Promise<DesiredDoc[]> {
  const docs: DesiredDoc[] = [
    { source_type: "hub-guide", source_id: HUB_GUIDE_SOURCE_ID, title: HUB_GUIDE_TITLE, content: HUB_GUIDE_TEXT },
  ];

  const filePosts = await pageAll<{
    id: string; title: string; description: string; section: string; media_type: string;
    file_assets: { label: string; scan_status: string }[];
  }>((from, to) =>
    db.from("file_posts").select("id, title, description, section, media_type, file_assets(label, scan_status)").is("deleted_at", null).order("id").range(from, to)
  );
  for (const p of filePosts) {
    const clean = (p.file_assets ?? []).filter((a) => a.scan_status === "clean");
    if (clean.length === 0) continue;
    docs.push({
      source_type: "file-post",
      source_id: p.id,
      title: p.title,
      content:
        `${p.title}\nFile Board — ${SECTION_LABELS[p.section] ?? p.section}, ${p.media_type}.\n` +
        `Files: ${clean.map((a) => a.label).join(", ")}\n\n${p.description}`,
    });
  }

  const posts = await pageAll<{ id: string; title: string | null; body: string; category: string | null }>((from, to) =>
    db.from("experience_posts").select("id, title, body, category").is("deleted_at", null).order("id").range(from, to)
  );
  for (const p of posts) {
    const title = p.title?.trim() || "Experience post";
    docs.push({
      source_type: "experience-post",
      source_id: p.id,
      title,
      content: `${title}\nExperience Board${p.category ? ` — ${p.category}` : ""}.\n\n${p.body}`,
    });
  }
  // Community answers: comments by a CURRENT Answerer or Verified member on a
  // Question post. Nothing else a member writes feeds the AI. The set is
  // rebuilt from the present state on every run, so an answer that was
  // deleted, hidden, noticed, or whose author lost the role or the account
  // simply stops being wanted and is removed by the sync below.
  const questions = await pageAll<{ id: string; title: string | null; body: string; author_id: string }>((from, to) =>
    db.from("experience_posts").select("id, title, body, author_id").eq("category", "question").is("deleted_at", null).order("id").range(from, to)
  );
  if (questions.length) {
    const byQuestion = new Map(questions.map((q) => [q.id, q]));
    const comments: { id: string; parent_id: string; author_id: string; body: string }[] = [];
    const questionIds = [...byQuestion.keys()];
    for (let i = 0; i < questionIds.length; i += 100) {
      const slice = questionIds.slice(i, i + 100);
      comments.push(
        ...(await pageAll<{ id: string; parent_id: string; author_id: string; body: string }>((from, to) =>
          db.from("comments").select("id, parent_id, author_id, body").eq("parent_type", "experience-post").is("deleted_at", null).in("parent_id", slice).order("id").range(from, to)
        ))
      );
    }
    const authorIds = [...new Set(comments.map((c) => c.author_id))];
    const [rolesRes, profilesRes, noticesRes] = await Promise.all([
      authorIds.length ? db.from("user_roles").select("user_id, role").in("user_id", authorIds).in("role", ["answerer", "verified"]) : { data: [] },
      authorIds.length ? db.from("profiles").select("id, account_status").in("id", authorIds) : { data: [] },
      comments.length ? db.from("item_notices").select("item_id").eq("item_kind", "comment").in("item_id", comments.map((c) => c.id)) : { data: [] },
    ]);
    const roles = new Map<string, Set<string>>();
    for (const r of (rolesRes.data ?? []) as { user_id: string; role: string }[]) {
      if (!roles.has(r.user_id)) roles.set(r.user_id, new Set());
      roles.get(r.user_id)!.add(r.role);
    }
    const active = new Set(((profilesRes.data ?? []) as { id: string; account_status: string }[]).filter((p) => p.account_status === "active").map((p) => p.id));
    const noticed = new Set(((noticesRes.data ?? []) as { item_id: string }[]).map((n) => n.item_id));

    for (const c of comments) {
      const q = byQuestion.get(c.parent_id);
      const r = roles.get(c.author_id);
      if (!q || !r || !active.has(c.author_id) || noticed.has(c.id)) continue;
      if (c.author_id === q.author_id) continue; // the asker's own replies never count
      const questionText = (q.title?.trim() ? `${q.title.trim()}\n` : "") + q.body;
      docs.push({
        source_type: "community-answer",
        source_id: c.id,
        title: (q.title?.trim() || q.body).slice(0, 120),
        content:
          `Community answer on the Experience Board (written by a ${r.has("verified") ? "Verified member" : "Answerer"}).\n\n` +
          `Question: ${questionText}\n\nAnswer: ${c.body}`,
      });
    }
  }
  return docs;
}

async function syncDocuments(db: Db) {
  const desired = await collectDesiredDocs(db);
  const existing = await pageAll<{ id: string; source_type: string; source_id: string; content_hash: string | null }>((from, to) =>
    db.from("kb_documents").select("id, source_type, source_id, content_hash").in("source_type", ["file-post", "experience-post", "hub-guide", "community-answer"]).order("id").range(from, to)
  );
  const byKey = new Map(existing.map((e) => [`${e.source_type}:${e.source_id}`, e]));
  const wanted = new Set<string>();

  for (const d of desired) {
    const key = `${d.source_type}:${d.source_id}`;
    wanted.add(key);
    const hash = sha(d.content);
    const found = byKey.get(key);
    if (!found) {
      const { error } = await db.from("kb_documents").insert({ ...d, content_hash: hash });
      if (error) throw new Error(error.message);
    } else if (found.content_hash !== hash) {
      await db.from("kb_chunks").delete().eq("document_id", found.id);
      await db.from("kb_document_models").delete().eq("document_id", found.id);
      const { error } = await db.from("kb_documents").update({ title: d.title, content: d.content, content_hash: hash }).eq("id", found.id);
      if (error) throw new Error(error.message);
    }
  }

  // Posts that were removed or no longer eligible (e.g. every file flagged).
  const stale = existing.filter((e) => !wanted.has(`${e.source_type}:${e.source_id}`)).map((e) => e.id);
  for (let i = 0; i < stale.length; i += 100) {
    await db.from("kb_documents").delete().in("id", stale.slice(i, i + 100));
  }
}

// Embeds the documents still unfinished for ONE model until the time budget
// runs out. Long books are embedded in resumable slices: chunking is
// deterministic, so a later call simply continues from however many chunk
// rows already exist for that model. A passage the provider rejects is stored
// with no vector (logged) so the numbering stays contiguous and the indexer
// never loops on it. A rate limit stops the run cleanly; the next run resumes.
// A dropped connection or a timeout, as opposed to a refusal: worth trying again.
function isTransient(err: unknown): boolean {
  if (err instanceof AIProviderError) return err.status === undefined && /could not reach/i.test(err.message);
  if (err instanceof Error) return /fetch failed|timed out|timeout|aborted|ECONNRESET|ETIMEDOUT|network/i.test(`${err.name} ${err.message} ${(err as { cause?: { message?: string } }).cause?.message ?? ""}`);
  return false;
}

async function embedPending(db: Db, model: string, budgetMs: number): Promise<{ processed: number; rateLimited: boolean; retryAfterSec: number | null }> {
  const deadline = Date.now() + budgetMs;
  const t0 = Date.now();
  // Set INDEX_TIMING=1 to log how long each step takes (for diagnosing slowness).
  const tick = (label: string) => { if (process.env.INDEX_TIMING) console.log(`[index ${model}] +${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`); };
  let processed = 0;
  let transientFailures = 0;

  while (Date.now() < deadline) {
    try {
    const { data: docs, error } = await db.rpc("kb_pending_documents", { p_model: model, p_limit: 1 });
    tick("pending-document lookup");
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) break;
    const doc = docs[0] as { id: string; title: string | null; content: string };

    const chunks = chunkText(doc.content);
    const { count } = await db.from("kb_chunks").select("id", { count: "exact", head: true }).eq("document_id", doc.id).eq("embedding_model", model);
    let next = count ?? 0;
    tick(`resume at piece ${next}`);

    try {
      while (next < chunks.length && Date.now() < deadline) {
        const slice = chunks.slice(next, next + 32);
        let vectors: (number[] | null)[];
        try {
          vectors = await embedPassages(slice.map((c) => `${doc.title ?? ""}\n${c}`), model);
          tick(`embedded ${slice.length}`);
        } catch (err) {
          tick(`embed failed: ${err instanceof Error ? err.message : err} (retry-after ${(err as AIProviderError).retryAfterSec ?? "none"})`);
          // A short rate-limit wait that fits in this run: wait it out and go on,
          // so the limit is used fully instead of stopping at every hit.
          if (err instanceof AIProviderError && err.status === 429 && err.retryAfterSec && Date.now() + (err.retryAfterSec + 1) * 1000 < deadline) {
            await new Promise((r) => setTimeout(r, (err.retryAfterSec! + 1) * 1000));
            continue;
          }
          throw err;
        }
        const rows = slice.map((content, i) => ({
          document_id: doc.id,
          chunk_index: next + i,
          content,
          embedding: vectors[i] ? JSON.stringify(vectors[i]) : null,
          embedding_model: model,
        }));
        const { error: insErr } = await db.from("kb_chunks").insert(rows);
        if (insErr) throw new Error(insErr.message);
        tick(`saved ${slice.length}`);
        next += slice.length;
      }
    } catch (err) {
      if (err instanceof AIProviderError && err.status === 429) return { processed, rateLimited: true, retryAfterSec: err.retryAfterSec ?? null };
      throw err;
    }

    if (next >= chunks.length) {
      const { error: doneErr } = await db.from("kb_document_models").upsert({ document_id: doc.id, model });
      if (doneErr) throw new Error(doneErr.message);
      processed++;
    } else {
      break; // out of time mid-document; the next call resumes here
    }
    } catch (err) {
      // A dropped connection: wait a moment and start the step again. The loop
      // re-reads how many pieces are already saved, so nothing is doubled.
      if (isTransient(err) && transientFailures < 6) {
        transientFailures++;
        console.error(`Indexing: temporary network problem (${transientFailures}); retrying.`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
  return { processed, rateLimited: false, retryAfterSec: null };
}

async function pendingFor(db: Db, model: string): Promise<number> {
  const { data } = await db.rpc("kb_pending_count", { p_model: model });
  return (data as number) ?? 0;
}

export async function getIndexStatus(db: Db = createServiceRoleClient()): Promise<Pick<IndexStatus, "documents" | "pendingDocuments" | "pendingNext" | "liveModel" | "nextModel">> {
  const [liveModel, nextModel] = await Promise.all([getLiveEmbeddingModel(), getNextEmbeddingModel()]);
  const { count: documents } = await db.from("kb_documents").select("id", { count: "exact", head: true });
  return {
    documents: documents ?? 0,
    pendingDocuments: await pendingFor(db, liveModel),
    pendingNext: nextModel ? await pendingFor(db, nextModel) : null,
    liveModel,
    nextModel,
  };
}

// One time-boxed slice: bring the live model up to date first (so searches
// are never stale), then spend what is left building the next model.
export async function runIndexing(budgetMs = 40_000): Promise<IndexStatus> {
  const db = createServiceRoleClient();
  const [live, next] = await Promise.all([getLiveEmbeddingModel(), getNextEmbeddingModel()]);
  const started = Date.now();
  await syncDocuments(db);
  const liveRun = await embedPending(db, live, budgetMs);
  let processed = liveRun.processed;
  let rateLimited = liveRun.rateLimited;
  let retryAfterSec = liveRun.retryAfterSec;
  if (next && !rateLimited) {
    const left = budgetMs - (Date.now() - started);
    if (left > 2000) {
      const nextRun = await embedPending(db, next, left);
      processed += nextRun.processed;
      rateLimited = nextRun.rateLimited;
      retryAfterSec = nextRun.retryAfterSec;
    }
  }
  const status = await getIndexStatus(db);
  return {
    ...status,
    processedThisRun: processed,
    rateLimited,
    retryAfterSec,
    done: status.pendingDocuments === 0 && (status.pendingNext ?? 0) === 0,
  };
}

// Adds (or replaces, by title) a philosophy book. Embedding happens in
// runIndexing(), so a large book never has to fit inside one request.
export async function addPhilosophyText(title: string, content: string): Promise<void> {
  const db = createServiceRoleClient();
  await db.from("kb_documents").delete().eq("source_type", "philosophy-text").eq("title", title);
  const { error } = await db.from("kb_documents").insert({
    source_type: "philosophy-text",
    title,
    content,
    content_hash: sha(content),
  });
  if (error) throw new Error(error.message);
}

export interface PhilosophyBook {
  id: string;
  title: string;
  characters: number;
  createdAt: string;
}

export async function listPhilosophyBooks(): Promise<PhilosophyBook[]> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("kb_documents")
    .select("id, title, content, created_at")
    .eq("source_type", "philosophy-text")
    .order("title");
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: d.id,
    title: d.title ?? "(untitled)",
    characters: d.content?.length ?? 0,
    createdAt: d.created_at,
  }));
}

// kb_chunks rows for this document are removed by the foreign key's own
// cascade (see kb_chunks.document_id ... on delete cascade in the schema).
export async function deletePhilosophyBook(id: string): Promise<void> {
  const db = createServiceRoleClient();
  const { error } = await db.from("kb_documents").delete().eq("id", id).eq("source_type", "philosophy-text");
  if (error) throw new Error(error.message);
}
