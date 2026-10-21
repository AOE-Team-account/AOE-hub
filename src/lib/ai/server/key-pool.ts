import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Keys the Creator added in the Creator panel (stored encrypted in Supabase
// Vault; see hub_ai_keys in schema.sql). They are read here, decrypted, only
// inside the server, kept in memory for 30 seconds, and never sent to a browser.

export type PoolProvider = "google" | "groq" | "qwen-intl" | "qwen-cn";

export interface PoolKey {
  /** Short, safe id for logs and the resting list, e.g. "p3f9a1c2" */
  id: string;
  provider: PoolProvider;
  label: string;
  key: string;
}

let cache: { at: number; keys: PoolKey[] } | null = null;
const TTL_MS = 30_000;

export function invalidateKeyPool() {
  cache = null;
}

export async function poolKeys(provider?: PoolProvider): Promise<PoolKey[]> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    try {
      const { data, error } = await createServiceRoleClient().rpc("hub_ai_key_secrets", { p_only_active: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { id: string; provider: PoolProvider; label: string; api_key: string }[];
      cache = { at: Date.now(), keys: rows.map((r) => ({ id: `p${r.id.replace(/-/g, "").slice(0, 8)}`, provider: r.provider, label: r.label, key: r.api_key })) };
    } catch (err) {
      // The pool is an addition: if it cannot be read, keys from the settings file still work.
      console.error("Could not read the AI key pool:", err instanceof Error ? err.message : err);
      cache = { at: Date.now() - TTL_MS + 5_000, keys: cache?.keys ?? [] };
    }
  }
  return provider ? cache.keys.filter((k) => k.provider === provider) : cache.keys;
}

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE = process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1";
export const QWEN_BASES: Record<"qwen-intl" | "qwen-cn", string> = {
  "qwen-intl": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  "qwen-cn": "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

/** Asks the company whether a key is accepted. A "too many requests" answer still means the key is real. */
export async function testPoolKey(provider: PoolProvider, key: string): Promise<{ ok: boolean; note: string }> {
  try {
    let res: Response;
    if (provider === "google") {
      res = await fetch(`${GOOGLE_BASE}/models?pageSize=1`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(20_000) });
    } else if (provider === "groq") {
      res = await fetch(`${GROQ_BASE}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    } else {
      res = await fetch(`${QWEN_BASES[provider]}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.QWEN_CHAT_MODEL || "qwen-plus", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        signal: AbortSignal.timeout(30_000),
      });
    }
    if (res.ok) return { ok: true, note: "Working." };
    if (res.status === 429) return { ok: true, note: "Accepted (its free limit is busy right now)." };
    if (res.status === 401 || res.status === 403 || (provider === "google" && res.status === 400)) return { ok: false, note: "The company did not accept this key." };
    return { ok: false, note: `The company answered with an error (${res.status}).` };
  } catch {
    return { ok: false, note: "Could not reach the company to check the key." };
  }
}
