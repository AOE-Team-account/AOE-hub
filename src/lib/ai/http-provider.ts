import type { AIProvider } from "./provider";
import type { AIReply } from "./types";

export const httpAIProvider: AIProvider = {
  async reply(message, lang, history) {
    let res: Response;
    try {
      res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, lang, history }),
      });
    } catch {
      throw new Error("Couldn't reach the assistant. Check your connection and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "The assistant is unavailable right now.");
    return data as AIReply;
  },
};
