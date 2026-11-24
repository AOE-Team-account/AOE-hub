import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { signingKey } from "@/lib/server-secrets";

// Playing a hosted game needs a signed-in member. The game's own address
// ("play.") never sees sign-in, so the hub (signed in) hands out a short-lived
// signed token that goes into the game's address:
//   play.example.com/<assetId>/<token>/index.html
// The game's own relative links keep carrying the token, so nothing else changes.
const TTL_MS = 12 * 60 * 60 * 1000;

// Its own key (APP_SIGNING_SECRET), never a fixed word (AOE-SEC-14); see server-secrets.ts.
const secret = () => signingKey("aoehub-game-token");
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
