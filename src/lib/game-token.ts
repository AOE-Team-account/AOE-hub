import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Playing a hosted game needs a signed-in member. The game's own address
// ("play.") never sees sign-in, so the hub (signed in) hands out a short-lived
// signed token that goes into the game's address:
//   play.example.com/<assetId>/<token>/index.html
// The game's own relative links keep carrying the token, so nothing else changes.
const TTL_MS = 12 * 60 * 60 * 1000;

// Derived from the server's private key, so there is no extra setting to keep.
const secret = () => createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-secret").update("aoehub-game-token").digest();
const sign = (assetId: string, exp: string) => createHmac("sha256", secret()).update(`${assetId}.${exp}`).digest("hex").slice(0, 32);

export function signGameToken(assetId: string): string {
  const exp = (Date.now() + TTL_MS).toString(36);
  return `${exp}-${sign(assetId, exp)}`;
}

export function verifyGameToken(assetId: string, token: string): boolean {
  const m = token.match(/^([0-9a-z]{6,12})-([0-9a-f]{32})$/);
  if (!m) return false;
  if (parseInt(m[1], 36) < Date.now()) return false;
  const want = Buffer.from(sign(assetId, m[1]));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}
