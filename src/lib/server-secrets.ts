import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Constant-time check of an "Authorization: Bearer <secret>" header (AOE-SEC-15). */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  // Hash both sides first so the comparison takes the same time whatever the lengths.
  const want = createHash("sha256").update(`Bearer ${secret}`).digest();
  const got = createHash("sha256").update(header).digest();
  return timingSafeEqual(want, got);
}

/** For the cron routes: is this the scheduled-jobs caller (CRON_SECRET)? */
export function isCronRequest(request: Request): boolean {
  return bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET);
}

// A key for signing things the hub hands out (game links, AI answers). Uses its own
// APP_SIGNING_SECRET when set (AOE-SEC-14). Until Clara sets it, a key is derived
// one-way from the server key with a purpose label, so the server key itself is
// never used to sign. With neither (local tests), a random key for this run only:
// never a fixed, guessable word.
let warned = false;
const processKey = randomBytes(32);
export function signingKey(purpose: string): Buffer {
  const own = process.env.APP_SIGNING_SECRET ?? "";
  if (own.length >= 32) return createHmac("sha256", own).update(purpose).digest();
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!warned && process.env.NODE_ENV === "production") {
    warned = true;
    console.warn("APP_SIGNING_SECRET is not set (32+ characters); using a derived key. Set it in the host's settings.");
  }
  if (fallback) return createHmac("sha256", fallback).update(`aoehub-derived:${purpose}`).digest();
  return createHmac("sha256", processKey).update(purpose).digest();
}
