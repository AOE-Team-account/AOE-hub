import "server-only";
import { AIProviderError } from "./chat-providers";
import { EMBEDDING_DIMENSIONS, getEmbeddingConfig } from "./config";
import { GEMINI_EMBEDDING_MODEL, getLiveEmbeddingModel } from "./embedding-models";

// Embeds text. The model decides the company: gemini-embedding-001 goes to
// Google's own embedding interface; any other model name uses the
// OpenAI-compatible interface configured in EMBEDDING_* (the local
// development model). Vectors are always 768 numbers, to fit the database.

const OPENAI_BATCH = 16;
const GEMINI_BATCH = 24;
const GEMINI_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";

export type EmbedKind = "document" | "query";

function isGemini(model: string) {
  return model === GEMINI_EMBEDDING_MODEL || model.startsWith("gemini-embedding");
}

// Reduced-size Gemini vectors are not unit length; search compares direction,
// so normalise them (Google's own instruction for sizes below 3,072).
function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

function retryAfterSeconds(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  const n = h ? Number(h) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function embedGemini(model: string, texts: string[], kind: EmbedKind): Promise<number[][]> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new AIProviderError("GOOGLE_AI_API_KEY is not set, so Google embeddings are not available.");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += GEMINI_BATCH) {
    const batch = texts.slice(i, i + GEMINI_BATCH);
    let res: Response;
    try {
      res = await fetch(`${GEMINI_BASE}/models/${model}:batchEmbedContents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new AIProviderError("Could not reach the embedding service.");
    }
    if (!res.ok) {
      const err = new AIProviderError(`The embedding service returned an error (${res.status}).`, res.status);
      err.retryAfterSec = retryAfterSeconds(res);
      throw err;
    }
    const data = await res.json();
    const vectors: number[][] = (data?.embeddings ?? []).map((e: { values: number[] }) => e.values);
    if (vectors.length !== batch.length) throw new AIProviderError("The embedding service returned the wrong number of vectors.");
    for (const v of vectors) {
      if (v.length !== EMBEDDING_DIMENSIONS) throw new AIProviderError(`Embedding model returned ${v.length} dimensions; the database expects ${EMBEDDING_DIMENSIONS}.`);
      out.push(normalize(v));
    }
  }
  return out;
}

async function embedOpenAiCompatible(texts: string[], kind: EmbedKind): Promise<number[][]> {
  const cfg = getEmbeddingConfig();
  const prefix = kind === "document" ? cfg.docPrefix : cfg.queryPrefix;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += OPENAI_BATCH) {
    const batch = texts.slice(i, i + OPENAI_BATCH).map((t) => prefix + t);
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, input: batch }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new AIProviderError("Could not reach the embedding service.");
    }
    if (!res.ok) {
      const err = new AIProviderError(`The embedding service returned an error (${res.status}).`, res.status);
      err.retryAfterSec = retryAfterSeconds(res);
      throw err;
    }
    const data = await res.json();
    const vectors: number[][] = (data?.data ?? []).sort((a: { index: number }, b: { index: number }) => a.index - b.index).map((d: { embedding: number[] }) => d.embedding);
    if (vectors.length !== batch.length) throw new AIProviderError("The embedding service returned the wrong number of vectors.");
    for (const v of vectors) {
      if (v.length !== cfg.dimensions) throw new AIProviderError(`Embedding model returned ${v.length} dimensions; the database expects ${cfg.dimensions}.`);
    }
    out.push(...vectors);
  }
  return out;
}

/** Embeds texts with a model (the live one if none is given). Throws on any failure. */
export async function embedTexts(texts: string[], kind: EmbedKind, model?: string): Promise<number[][]> {
  const m = model ?? (await getLiveEmbeddingModel());
  return isGemini(m) ? embedGemini(m, texts, kind) : embedOpenAiCompatible(texts, kind);
}

/**
 * For indexing: embeds passages, but never lets one bad passage block the
 * rest. If a batch is rejected (not rate-limited), each passage is tried on
 * its own and an individually rejected one comes back as null (logged), so
 * the indexer can skip it instead of retrying the same batch forever.
 * Rate limits (429) are NOT swallowed: the caller stops and resumes later.
 */
export async function embedPassages(texts: string[], model: string): Promise<(number[] | null)[]> {
  try {
    return await embedTexts(texts, "document", model);
  } catch (err) {
    if (!(err instanceof AIProviderError) || err.status === 429 || err.status === 401 || err.status === 403 || err.status === undefined) throw err;
    if (texts.length === 1) {
      console.error(`Embedding rejected a passage (${err.status}); skipping it.`);
      return [null];
    }
    const out: (number[] | null)[] = [];
    for (const t of texts) out.push(...(await embedPassages([t], model)));
    return out;
  }
}
