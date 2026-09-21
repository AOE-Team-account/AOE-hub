// Providers a member may bring their own key for. Base URLs are fixed on
// purpose: letting members type an arbitrary URL would let them aim this
// server at internal addresses (SSRF). Model names stay editable because
// providers rename them often — a stale default should never be a dead end.
export type ByoProviderId = "google" | "anthropic" | "openai";

export interface ByoProvider {
  id: ByoProviderId;
  label: string;
  kind: "openai-compatible" | "anthropic";
  baseUrl: string;
  defaultModel: string;
  keyHelpUrl: string;
}

export const BYO_PROVIDERS: Record<ByoProviderId, ByoProvider> = {
  google: {
    id: "google",
    label: "Google AI Studio (free key available)",
    kind: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    keyHelpUrl: "https://aistudio.google.com/apikey",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-haiku-4-5",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyHelpUrl: "https://platform.openai.com/api-keys",
  },
};

export const BYO_PROVIDER_ORDER: ByoProviderId[] = ["google", "anthropic", "openai"];

export const MODEL_NAME_PATTERN = /^[A-Za-z0-9._:/-]{1,100}$/;
