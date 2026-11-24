import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { signingKey } from "@/lib/server-secrets";

// The browser sends the chat so far with each question. Earlier AI answers carry a
// signature made here (AOE-SEC-20), so a made-up "AI said..." turn is dropped.
// The signature covers the answer text, the chat's own id and the time it was given
// (AOE-INF-09), so a real answer can't be pasted into another chat or reused later.
const key = () => signingKey("aoehub-ai-history");
const MAX_AGE_MS = 24 * 60 * 60_000;
const CHAT_ID = /^[A-Za-z0-9_-]{16,64}$/;

export const validChatId = (v: unknown): v is string => typeof v === "string" && CHAT_ID.test(v);

export function signAnswer(text: string, chatId: string, ts: number): string {
  return createHmac("sha256", key()).update(`v2\n${chatId}\n${ts}\n${text}`).digest("base64url").slice(0, 32);
}

export function answerSignatureOk(text: string, chatId: unknown, ts: unknown, sig: unknown): boolean {
  if (!validChatId(chatId) || typeof sig !== "string" || sig.length !== 32) return false;
  if (typeof ts !== "number" || !Number.isSafeInteger(ts)) return false;
  const age = Date.now() - ts;
  if (age < -60_000 || age > MAX_AGE_MS) return false;
  const want = Buffer.from(signAnswer(text, chatId, ts));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
