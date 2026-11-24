import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { signingKey } from "@/lib/server-secrets";

// The browser sends the chat so far with each question. Earlier AI answers carry a
// signature made here, so a made-up "AI said..." turn is dropped (AOE-SEC-20).
const key = () => signingKey("aoehub-ai-history");

export function signAnswer(text: string): string {
  return createHmac("sha256", key()).update(text).digest("base64url").slice(0, 32);
}

export function answerSignatureOk(text: string, sig: unknown): boolean {
  if (typeof sig !== "string" || sig.length !== 32) return false;
  const want = Buffer.from(signAnswer(text));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
