import "server-only";

// The hub's Google AI Studio keys: GOOGLE_AI_API_KEY, then GOOGLE_AI_API_KEY_2
// ... _9. Google counts free-tier limits per PROJECT, so a second key only
// adds capacity if it was made in a different project. The keys are tried in
// order and a key that has hit a limit rests while the next one is used.
export interface GoogleKey {
  /** "1", "2", ... (never the key itself; safe to log and show) */
  id: string;
  key: string;
}

export function googleKeys(): GoogleKey[] {
  const out: GoogleKey[] = [];
  const first = process.env.GOOGLE_AI_API_KEY?.trim();
  if (first) out.push({ id: "1", key: first });
  for (let i = 2; i <= 9; i++) {
    const k = process.env[`GOOGLE_AI_API_KEY_${i}`]?.trim();
    // Skip empty slots and an accidental copy of a key already listed.
    if (k && !out.some((o) => o.key === k)) out.push({ id: String(i), key: k });
  }
  return out;
}
