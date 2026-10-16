import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { AIProviderError, chatComplete, type ChatMessage } from "./chat-providers";
import { getHubChatTarget, type ChatTarget } from "./config";

// The hub's own answer-and-translation AI: Gemini first, Groq when Gemini is
// full, and back to Gemini as soon as it has rested. (A member's own key
// bypasses all of this.) Embeddings are separate: they cannot fail over,
// because vectors from different models cannot be mixed.
//
// When a company answers "too many requests" (or its key is refused, or it is
// down) it is marked resting for a while — the length it asked for, or a
// growing default — and skipped until then. The resting state lives in the
// database (ai_provider_state) so it is shared and the admin page can show it.

export type HubProviderId = "gemini" | "groq" | "local";

interface HubProvider {
  id: HubProviderId;
  label: string;
  target: ChatTarget;
}

// The base addresses can be overridden (GEMINI_OPENAI_BASE, GROQ_API_BASE) for testing against a stand-in server.
const GEMINI_OPENAI_BASE = process.env.GEMINI_OPENAI_BASE || "https://generativelanguage.googleapis.com/v1beta/openai";
const GROQ_BASE = process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1";
// Model names change often, so they are settings with a sensible default.
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

// First rest period grows with repeated failures: 1 min, 5 min, 30 min, 2 h, 6 h.
const REST_LADDER_SEC = [60, 300, 1800, 7200, 21600];

export function hubProviders(): HubProvider[] {
  const out: HubProvider[] = [];
  const google = process.env.GOOGLE_AI_API_KEY;
  const groq = process.env.GROQ_API_KEY;
  if (google) {
    out.push({
      id: "gemini",
      label: "Gemini",
      target: { kind: "openai-compatible", baseUrl: GEMINI_OPENAI_BASE, apiKey: google, model: process.env.GEMINI_CHAT_MODEL || DEFAULT_GEMINI_MODEL },
    });
  }
  if (groq) {
    out.push({
      id: "groq",
      label: "Groq",
      target: { kind: "openai-compatible", baseUrl: GROQ_BASE, apiKey: groq, model: process.env.GROQ_CHAT_MODEL || DEFAULT_GROQ_MODEL },
    });
  }
  if (out.length === 0) {
    // Development only: the local model from AI_* settings.
    out.push({ id: "local", label: "Local model", target: getHubChatTarget() });
  }
  return out;
}

interface StateRow {
  provider: string;
  rested_until: string | null;
  strikes: number;
  last_error: string | null;
  last_ok_at: string | null;
}

async function loadStates(): Promise<Map<string, StateRow>> {
  const { data } = await createServiceRoleClient().from("ai_provider_state").select("provider, rested_until, strikes, last_error, last_ok_at");
  return new Map(((data ?? []) as StateRow[]).map((r) => [r.provider, r]));
}

async function rest(provider: string, prior: StateRow | undefined, err: AIProviderError) {
  const strikes = (prior?.strikes ?? 0) + 1;
  let seconds: number;
  if (err.status === 429) seconds = Math.max(err.retryAfterSec ?? 0, REST_LADDER_SEC[Math.min(strikes - 1, REST_LADDER_SEC.length - 1)]);
  else if (err.status === 401 || err.status === 403) seconds = 3600;
  else seconds = 30;
  await createServiceRoleClient().from("ai_provider_state").upsert({
    provider,
    rested_until: new Date(Date.now() + seconds * 1000).toISOString(),
    strikes,
    last_error: err.message.slice(0, 200),
    updated_at: new Date().toISOString(),
  });
}

async function markWorking(provider: string, prior: StateRow | undefined) {
  // Healthy and already recorded: no write on every answer. The first success
  // (and the first one after a rest) is recorded so the admin page can say "working".
  if (prior && prior.strikes === 0 && !prior.rested_until) return;
  await createServiceRoleClient().from("ai_provider_state").upsert({
    provider,
    rested_until: null,
    strikes: 0,
    last_error: null,
    last_ok_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// A failure that is the provider's fault (limit, key, outage), as opposed to
// the question itself being unanswerable. Those are the ones worth resting for.
function isProviderFailure(err: unknown): err is AIProviderError {
  if (!(err instanceof AIProviderError)) return false;
  if (err.status === undefined) return !/empty answer/i.test(err.message); // network/timeouts
  return err.status === 429 || err.status === 401 || err.status === 403 || err.status >= 500;
}

export async function hubChat(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<{ text: string; provider: HubProviderId }> {
  const providers = hubProviders();
  const states = await loadStates();
  const now = Date.now();
  let lastError: AIProviderError | null = null;

  for (const p of providers) {
    const st = states.get(p.id);
    if (st?.rested_until && new Date(st.rested_until).getTime() > now && providers.length > 1) continue;
    try {
      const text = await chatComplete(p.target, messages, opts);
      await markWorking(p.id, st);
      return { text, provider: p.id };
    } catch (err) {
      if (!isProviderFailure(err)) throw err;
      lastError = err;
      await rest(p.id, st, err);
    }
  }
  throw new AIProviderError(
    lastError?.status === 401 || lastError?.status === 403
      ? "The hub's AI service is not set up correctly right now. Please try again later."
      : "The assistant is very busy right now. Please try again in a little while.",
    429
  );
}

export interface ProviderStatus {
  id: HubProviderId;
  label: string;
  model: string;
  restingUntil: string | null;
  lastError: string | null;
  lastOkAt: string | null;
}

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const states = await loadStates();
  const now = Date.now();
  return hubProviders().map((p) => {
    const st = states.get(p.id);
    const resting = st?.rested_until && new Date(st.rested_until).getTime() > now ? st.rested_until : null;
    return { id: p.id, label: p.label, model: p.target.model, restingUntil: resting, lastError: st?.last_error ?? null, lastOkAt: st?.last_ok_at ?? null };
  });
}
