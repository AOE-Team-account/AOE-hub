import { httpAIProvider } from "./http-provider";
import type { AIProvider } from "./provider";

// The single place that decides what backs the chat UI. Which model actually
// answers (local Ollama, a hosted API, or a member's own key) is decided on
// the server — see src/lib/ai/server/.
export const aiProvider: AIProvider = httpAIProvider;

export type { AIProvider } from "./provider";
export type { AIReply, AISource, AIHistoryTurn } from "./types";
