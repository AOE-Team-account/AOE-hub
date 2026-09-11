import type { AIProvider } from "./provider";

// Placeholder implementation ported from hub-prototype.html's aiReply().
// This is NOT the real RAG assistant — Phase 5 of the roadmap replaces this
// with a real embedding pipeline + swappable model (commercial API or a
// self-hosted open-source model via Ollama/vLLM). Everything that calls
// AIProvider.reply() only depends on the interface in provider.ts, so that
// swap shouldn't touch any UI code.

const RESPONSES: { keywords: string[]; reply: string }[] = [
  {
    keywords: ["phonics", "file", "curriculum", "download"],
    reply: "Try the File Board — the Curriculum or Books sections, or just search for it at the top of the page.",
  },
  {
    keywords: ["why", "philosophy", "mason"],
    reply: 'Look for posts tagged "Philosophy" on the Experience Board — that\'s where people share their thinking on questions like that, not just the admins.',
  },
  {
    keywords: ["group"],
    reply: "You can browse or start one from the Groups tab — some are public, some are private and invite-only.",
  },
  {
    keywords: ["point"],
    reply: 'Points come from views, downloads, and discussion on the File Board. There\'s a full breakdown under "How points work" on your profile.',
  },
];

const FALLBACK =
  "I'm not confident about that one. On the real hub, a question I can't answer well gets forwarded to the admins instead of guessing.";

export const keywordAIProvider: AIProvider = {
  async reply(message: string) {
    const m = message.toLowerCase();
    const match = RESPONSES.find((r) => r.keywords.some((k) => m.includes(k)));
    return match ? match.reply : FALLBACK;
  },
};
