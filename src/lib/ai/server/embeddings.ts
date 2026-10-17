import "server-only";
import { AIProviderError } from "./chat-providers";
import { EMBEDDING_DIMENSIONS, getEmbeddingConfig } from "./config";
import { googleKeys } from "./google-keys";
import { GEMINI_EMBEDDING_MODEL, getLiveEmbeddingModel } from "./embedding-models";

// Embeds text. The model decides the company: gemini-embedding-001 goes to
// Google's own embedding interface; any other model name uses the
// OpenAI-compatible interface configured in EMBEDDING_* (the local
// development model). Vectors are always 768 numbers, to fit the database.

const OPENAI_BATCH = 16;
const GEMINI_BATCH = 32;
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

function retryAfterSeconds(res: Response, body?: string): number | undefined {
  const h = res.headers.get("retry-after");
  const n = h ? Number(h) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  // Google puts the wait in the message ("Please retry in 38.7s") and in RetryInfo ("retryDelay": "38s").
  const m = body?.match(/retry in ([\d.]+)s/i) ?? body?.match(/"retryDelay":\s*"([\d.]+)s"/i);
  return m ? Math.ceil(Number(m[1])) : undefined;
}

// Keys that recently hit a limit, and until when (this server process). A
// daily limit rests a key for hours; a per-minute one for about a minute.
const keyRestUntil = new Map<string, number>();

async function embedGeminiBatch(model: string, key: string, batch: string[], kind: EmbedKind): Promise<number[][]> {
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
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AIProviderError("Could not reach the embedding service.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new AIProviderError(`The embedding service returned an error (${res.status}).`, res.status);
    err.retryAfterSec = retryAfterSeconds(res, body);
    throw err;
  }
  const data = await res.json();
  const vectors: number[][] = (data?.embeddings ?? []).map((e: { values: number[] }) => e.values);
  if (vectors.length !== batch.length) throw new AIProviderError("The embedding service returned the wrong number of vectors.");
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSIONS) throw new AIProviderError(`Embedding model returned ${v.length} dimensions; the database expects ${EMBEDDING_DIMENSIONS}.`);
  }
  return vectors.map(normalize);
}

async function embedGemini(model: string, texts: string[], kind: EmbedKind): Promise<number[][]> {
  const keys = googleKeys();
  if (keys.length === 0) throw new AIProviderError("GOOGLE_AI_API_KEY is not set, so Google embeddings are not available.");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += GEMINI_BATCH) {
    const batch = texts.slice(i, i + GEMINI_BATCH);
    let lastLimit: AIProviderError | null = null;
    let done: number[][] | null = null;
    // First key that is not resting; if it hits a limit, rest it and try the next.
    for (const k of keys) {
      if ((keyRestUntil.get(k.id) ?? 0) > Date.now()) continue;
      try {
        done = await embedGeminiBatch(model, k.key, batch, kind);
        break;
      } catch (err) {
        if (err instanceof AIProviderError && err.status === 429) {
          keyRestUntil.set(k.id, Date.now() + (err.retryAfterSec ?? 60) * 1000);
          lastLimit = err;
          continue;
        }
        throw err;
      }
    }
    if (!done) {
      // Every key is resting: report how long until the first one is free.
      const soonest = Math.min(...keys.map((k) => keyRestUntil.get(k.id) ?? 0));
      const err = new AIProviderError("The embedding service is rate-limiting requests right now.", 429);
      err.retryAfterSec = Math.max(1, Math.ceil((soonest - Date.now()) / 1000));
      if (lastLimit && !err.retryAfterSec) err.retryAfterSec = lastLimit.retryAfterSec;
      throw err;
    }
    out.push(...done);
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
