// Other AI assistants the hub AI points to when a question is not for it.
// Chinese readers get assistants that work in mainland China; everyone else gets the international ones.
export interface OtherAi { name: string; url: string }

const INTERNATIONAL: OtherAi[] = [
  { name: "Gemini", url: "https://gemini.google.com" },
  { name: "Claude", url: "https://claude.ai" },
  { name: "ChatGPT", url: "https://chatgpt.com" },
  { name: "Grok", url: "https://grok.com" },
];

const CHINESE: OtherAi[] = [
  { name: "千问 (Qwen)", url: "https://www.qianwen.com" },
  { name: "DeepSeek", url: "https://chat.deepseek.com" },
  { name: "豆包", url: "https://www.doubao.com" },
  { name: "Kimi", url: "https://www.kimi.com" },
];

export function otherAisFor(lang: string): OtherAi[] {
  return lang.startsWith("zh") ? CHINESE : INTERNATIONAL;
}
