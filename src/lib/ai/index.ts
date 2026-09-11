import { keywordAIProvider } from "./keyword-provider";
import type { AIProvider } from "./provider";

// The single place that decides which AI provider backs the hub assistant.
// Swap this one line for a real RAG/LLM provider in Phase 5 — nothing else
// in the app should need to change.
export const aiProvider: AIProvider = keywordAIProvider;

export type { AIProvider } from "./provider";
