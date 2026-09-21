import "server-only";

// Simple in-memory sliding-window limiter. It protects the hub's own AI
// budget from a runaway client. It is per server process, so it is a
// speed bump, not a hard guarantee — fine for a single long-running Node
// server; move it to the database if the app ever runs on many instances.
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
