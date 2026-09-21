import "server-only";
import type { ChatTarget } from "./config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Errors carry only a safe, key-free message — callers may show it to members.
export class AIProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const TIMEOUT_MS = 120_000;

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AIProviderError("Could not reach the AI service.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AIProviderError("The AI service rejected the API key.", res.status);
    if (res.status === 429) throw new AIProviderError("The AI service is rate-limiting requests right now.", res.status);
    throw new AIProviderError(`The AI service returned an error (${res.status}).`, res.status);
  }
  return res.json();
}

export async function chatComplete(
  target: ChatTarget,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0.2;

  if (target.kind === "anthropic") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const data = await post(
      `${trimSlash(target.baseUrl)}/v1/messages`,
      { "x-api-key": target.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: target.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: messages.filter((m) => m.role !== "system"),
      }
    );
    const text = (data?.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    if (!text) throw new AIProviderError("The AI service returned an empty answer.");
    return text.trim();
  }

  const data = await post(
    `${trimSlash(target.baseUrl)}/chat/completions`,
    target.apiKey ? { authorization: `Bearer ${target.apiKey}` } : {},
    { model: target.model, messages, max_tokens: maxTokens, temperature, stream: false }
  );
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AIProviderError("The AI service returned an empty answer.");
  return text.trim();
}
