import "server-only";
import { poolKeys } from "./key-pool";

// The hub's Google AI Studio keys, in the order they are tried: first those in
// the server's settings file (GOOGLE_AI_API_KEY, then GOOGLE_AI_API_KEY_2 ...
// _9), then those the Creator added in the Creator panel. Google counts
// free-tier limits per PROJECT, so an extra key only adds capacity if it was
// made in a different project. A key that has hit a limit rests while the next
// one is used.
export interface GoogleKey {
  /** "1", "2", ... or "p3f9a1c2" (never the key itself; safe to log and show) */
  id: string;
  key: string;
  label?: string;
}

export async function googleKeys(): Promise<GoogleKey[]> {
  const out: GoogleKey[] = [];
  const first = process.env.GOOGLE_AI_API_KEY?.trim();
  if (first) out.push({ id: "1", key: first });
  for (let i = 2; i <= 9; i++) {
    const k = process.env[`GOOGLE_AI_API_KEY_${i}`]?.trim();
    // Skip empty slots and an accidental copy of a key already listed.
    if (k && !out.some((o) => o.key === k)) out.push({ id: String(i), key: k });
  }
  for (const p of await poolKeys("google")) {
    if (!out.some((o) => o.key === p.key)) out.push({ id: p.id, key: p.key, label: p.label });
  }
  return out;
}
