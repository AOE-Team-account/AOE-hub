import "server-only";
import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { chunkText } from "../chunking";
import { currentEmbeddingModel, embedTexts } from "./embeddings";
import { HUB_GUIDE_SOURCE_ID, HUB_GUIDE_TEXT, HUB_GUIDE_TITLE } from "./hub-guide";

type Db = ReturnType<typeof createServiceRoleClient>;
type SourceType = "file-post" | "experience-post" | "hub-guide";

interface DesiredDoc {
  source_type: SourceType;
  source_id: string;
  title: string;
  content: string;
}

export interface IndexStatus {
  documents: number;
  pendingDocuments: number;
  processedThisRun: number;
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
// is later flagged, the post drops out of the index on the next sync.
async function collectDesiredDocs(db: Db): Promise<DesiredDoc[]> {
  const docs: DesiredDoc[] = [
    { source_type: "hub-guide", source_id: HUB_GUIDE_SOURCE_ID, title: HUB_GUIDE_TITLE, content: HUB_GUIDE_TEXT },
  ];

  const filePosts = await pageAll<{
    id: string; title: string; description: string; section: string; media_type: string;
    file_assets: { label: string; scan_status: string }[];
  }>((from, to) =>
    db.from("file_posts").select("id, title, description, section, media_type, file_assets(label, scan_status)").order("id").range(from, to)
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
    db.from("experience_posts").select("id, title, body, category").order("id").range(from, to)
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
  return docs;
}

async function syncDocuments(db: Db) {
  const desired = await collectDesiredDocs(db);
  const existing = await pageAll<{ id: string; source_type: string; source_id: string; content_hash: string | null }>((from, to) =>
    db.from("kb_documents").select("id, source_type, source_id, content_hash").in("source_type", ["file-post", "experience-post", "hub-guide"]).order("id").range(from, to)
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
      const { error } = await db.from("kb_documents").update({ title: d.title, content: d.content, content_hash: hash, indexed_model: null }).eq("id", found.id);
      if (error) throw new Error(error.message);
    }
  }

  // Posts that were removed or no longer eligible (e.g. every file flagged).
  const stale = existing.filter((e) => !wanted.has(`${e.source_type}:${e.source_id}`)).map((e) => e.id);
  for (let i = 0; i < stale.length; i += 100) {
    await db.from("kb_documents").delete().in("id", stale.slice(i, i + 100));
  }
}

// Embeds unfinished documents until the time budget runs out. Long books are
// embedded in resumable slices: chunking is deterministic, so a later call
// simply continues from however many chunks already exist.
async function embedPending(db: Db, model: string, budgetMs: number): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let processed = 0;

  // A model swap invalidates every vector made by the old one.
  await db.from("kb_chunks").delete().or(`embedding_model.is.null,embedding_model.neq.${model}`);

  while (Date.now() < deadline) {
    const { data: docs, error } = await db
      .from("kb_documents")
      .select("id, title, content")
      .or(`indexed_model.is.null,indexed_model.neq.${model}`)
      .order("created_at")
      .limit(1);
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) break;
    const doc = docs[0];

    const chunks = chunkText(doc.content);
    const { count } = await db.from("kb_chunks").select("id", { count: "exact", head: true }).eq("document_id", doc.id).eq("embedding_model", model);
    let next = count ?? 0;

    while (next < chunks.length && Date.now() < deadline) {
      const slice = chunks.slice(next, next + 16);
      const vectors = await embedTexts(slice.map((c) => `${doc.title ?? ""}\n${c}`), "document");
      const rows = slice.map((content, i) => ({
        document_id: doc.id,
        chunk_index: next + i,
        content,
        embedding: JSON.stringify(vectors[i]),
        embedding_model: model,
      }));
      const { error: insErr } = await db.from("kb_chunks").insert(rows);
      if (insErr) throw new Error(insErr.message);
      next += slice.length;
    }

    if (next >= chunks.length) {
      await db.from("kb_documents").update({ indexed_model: model }).eq("id", doc.id);
      processed++;
    } else {
      break; // out of time mid-document; the next call resumes here
    }
  }
  return processed;
}

export async function getIndexStatus(db: Db = createServiceRoleClient()): Promise<Pick<IndexStatus, "documents" | "pendingDocuments">> {
  const model = currentEmbeddingModel();
  const { count: documents } = await db.from("kb_documents").select("id", { count: "exact", head: true });
  const { count: pending } = await db
    .from("kb_documents")
    .select("id", { count: "exact", head: true })
    .or(`indexed_model.is.null,indexed_model.neq.${model}`);
  return { documents: documents ?? 0, pendingDocuments: pending ?? 0 };
}

export async function runIndexing(budgetMs = 40_000): Promise<IndexStatus> {
  const db = createServiceRoleClient();
  const model = currentEmbeddingModel();
  await syncDocuments(db);
  const processedThisRun = await embedPending(db, model, budgetMs);
  const status = await getIndexStatus(db);
  return { ...status, processedThisRun, done: status.pendingDocuments === 0 };
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
