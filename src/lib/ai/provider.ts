import type { AIHistoryTurn, AIReply, LanguageCode } from "./types";

// What the UI talks to. The real work (retrieval, the model, the member's own
// key) all happens behind /api/ai/chat — the browser never sees a model, a
// key, or the knowledge base.
export interface AIProvider {
  /** `chatId`: a random id for this chat window; answers are signed for this chat only (AOE-INF-09). */
  /** `captchaToken`: a Turnstile token, needed for signed-out questions once Turnstile is set up (AOE-SEC-24). */
  reply(message: string, lang: LanguageCode, history: AIHistoryTurn[], chatId: string, captchaToken?: string): Promise<AIReply>;
}
