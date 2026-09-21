import "server-only";
import { AIProviderError } from "./chat-providers";
import { getEmbeddingConfig } from "./config";

const BATCH_SIZE = 16;

// Embeds text with the hub's embedding model. `kind` selects the prefix some
// models (e.g. nomic-embed-text) need to tell documents from queries apart.
export async function embedTexts(texts: string[], kind: "document" | "query"): Promise<number[][]> {
  const cfg = getEmbeddingConfig();
  const prefix = kind === "document" ? cfg.docPrefix : cfg.queryPrefix;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => prefix + t);
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: cfg.model, input: batch }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new AIProviderError("Could not reach the embedding service.");
    }
    if (!res.ok) throw new AIProviderError(`The embedding service returned an error (${res.status}).`, res.status);

    const data = await res.json();
    const vectors: number[][] = (data?.data ?? []).sort((a: { index: number }, b: { index: number }) => a.index - b.index).map((d: { embedding: number[] }) => d.embedding);
    if (vectors.length !== batch.length) throw new AIProviderError("The embedding service returned the wrong number of vectors.");
    for (const v of vectors) {
      if (v.length !== cfg.dimensions) {
        throw new AIProviderError(`Embedding model returned ${v.length} dimensions; the database expects ${cfg.dimensions}.`);
      }
    }
    out.push(...vectors);
  }
  return out;
}

export function currentEmbeddingModel(): string {
  return getEmbeddingConfig().model;
}
