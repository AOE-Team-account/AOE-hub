// Cleans text that came from an AI answer before it is stored: no web
// addresses, no HTML, no control characters, and an upper length.
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Pulls the first JSON object or array out of an AI reply. */
export function parseJson(text: string): unknown {
  const m = /[\[{][\s\S]*[\]}]/.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function sha1(text: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha1").update(text).digest("hex");
}

/** An address with its tracking parts removed, used to recognise the same article again. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref|cmpid|mc_)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString().replace(/\/$/, "");
  } catch { return raw; }
}
