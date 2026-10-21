import type { TParams, UiKey } from "./strings";

// The moderation reasons are stored in the database in English; this shows
// each one in the reader's language (and falls back to the stored wording for
// a reason added later that has no translation yet).
const CODES = ["scam", "harmful", "inappropriate", "child-safety", "wrong-ideas", "ads", "paywalled", "copyright", "off-topic", "other", "no-violation", "already-handled", "mistaken-report"] as const;
const KEYS: Record<string, UiKey> = Object.fromEntries(CODES.map((c) => [c, `reason.${c}` as UiKey]));

export function reasonText(t: (key: UiKey, params?: TParams) => string, code: string, fallback?: string): string {
  const key = KEYS[code];
  return key ? t(key) : fallback ?? code;
}
