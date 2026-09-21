import "server-only";

// The hub's own default AI + embedding setup, read from environment
// variables. Swapping providers (local Ollama -> Google/OpenAI/Anthropic, or
// a hosted vLLM) is an env change, not a code change.

export class AINotConfiguredError extends Error {}

export type ChatTarget =
  | { kind: "openai-compatible"; baseUrl: string; apiKey?: string; model: string }
  | { kind: "anthropic"; baseUrl: string; apiKey: string; model: string };

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  dimensions: number;
  docPrefix: string;
  queryPrefix: string;
}

// The vector column is fixed at this size (see supabase/schema.sql).
export const EMBEDDING_DIMENSIONS = 768;

export function getHubChatTarget(): ChatTarget {
  const kind = process.env.AI_PROVIDER || "openai-compatible";
  const model = process.env.AI_CHAT_MODEL;
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY || undefined;

  if (kind === "anthropic") {
    if (!apiKey || !model) throw new AINotConfiguredError("AI_API_KEY and AI_CHAT_MODEL are required for AI_PROVIDER=anthropic.");
    return { kind: "anthropic", baseUrl: baseUrl || "https://api.anthropic.com", apiKey, model };
  }
  if (!baseUrl || !model) throw new AINotConfiguredError("AI_BASE_URL and AI_CHAT_MODEL are not set.");
  return { kind: "openai-compatible", baseUrl, apiKey, model };
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const baseUrl = process.env.EMBEDDING_BASE_URL;
  const model = process.env.EMBEDDING_MODEL;
  if (!baseUrl || !model) throw new AINotConfiguredError("EMBEDDING_BASE_URL and EMBEDDING_MODEL are not set.");
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS || EMBEDDING_DIMENSIONS);
  if (dimensions !== EMBEDDING_DIMENSIONS) {
    throw new AINotConfiguredError(`EMBEDDING_DIMENSIONS must be ${EMBEDDING_DIMENSIONS} to match the database column.`);
  }
  return {
    baseUrl,
    apiKey: process.env.EMBEDDING_API_KEY || undefined,
    model,
    dimensions,
    docPrefix: process.env.EMBEDDING_DOC_PREFIX ?? "",
    queryPrefix: process.env.EMBEDDING_QUERY_PREFIX ?? "",
  };
}
