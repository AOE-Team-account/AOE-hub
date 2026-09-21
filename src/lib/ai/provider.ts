import type { AIHistoryTurn, AIReply, LanguageCode } from "./types";

// What the UI talks to. The real work (retrieval, the model, the member's own
// key) all happens behind /api/ai/chat — the browser never sees a model, a
// key, or the knowledge base.
export interface AIProvider {
  reply(message: string, lang: LanguageCode, history: AIHistoryTurn[]): Promise<AIReply>;
}
