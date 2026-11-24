import "server-only";
import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Rate limits (AOE-SEC-04).
//
// rateLimited(): a quick in-memory sliding window, per server process.
// rateLimitedShared(): the same check, then a counter in the database that every
// server process shares and that survives a restart (take_rate_limit). Use this
// one for anything a stranger can reach. If the database cannot be asked, the
// in-memory answer is used, so a database hiccup never blocks everyone.
const hits = new Map<string, number[]>();

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return false;
}

export async function rateLimitedShared(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (rateLimited(key, limit, windowMs)) return true;
  try {
    // Only a fingerprint of the key is stored (no raw addresses or ids in the table).
    const bucket = createHash("sha256").update(key).digest("base64url").slice(0, 32);
    const { data, error } = await createServiceRoleClient().rpc("take_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
    });
    if (error) throw new Error(error.message);
    return data === false;
  } catch (err) {
    console.error("Shared rate limit unavailable; using this process's count:", err instanceof Error ? err.message : err);
    return false;
  }
}
