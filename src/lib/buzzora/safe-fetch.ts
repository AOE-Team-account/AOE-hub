import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

// Fetching a page whose address came from the internet is a classic attack
// route (making the server call something inside its own network). Every
// address is checked before it is fetched, and again after each redirect:
// plain https only, no passwords in the address, only hosts the caller allows,
// and the host must resolve to public internet addresses only.

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::" || v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return false;
}

async function assertSafe(rawUrl: string, allowHost: (host: string) => boolean): Promise<URL> {
  const u = new URL(rawUrl);
  if (u.protocol !== "https:") throw new Error("Only https addresses are allowed.");
  if (u.username || u.password) throw new Error("Addresses with a password are not allowed.");
  if (u.port && u.port !== "443") throw new Error("Unusual ports are not allowed.");
  const host = u.hostname.toLowerCase();
  if (net.isIP(host) || !allowHost(host)) throw new Error("That site is not on the allowed list.");
  const addrs = await dns.lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("That address is not a public one.");
  return u;
}

export interface SafeText { url: string; status: number; contentType: string; text: string }

/** Fetches a page as text, with a size cap and timeout, following up to 3 redirects that are each re-checked. */
export async function safeFetchText(
  rawUrl: string,
  allowHost: (host: string) => boolean,
  opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {}
): Promise<SafeText> {
  const maxBytes = opts.maxBytes ?? 1_500_000;
  let current = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertSafe(current, allowHost);
    const res = await fetch(u, {
      redirect: "manual",
      headers: { "user-agent": "AOEhubBot/1.0 (+https://aoe.ai)", accept: opts.accept ?? "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes) { await reader.cancel(); break; }
      chunks.push(value);
    }
    return { url: u.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", text: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("Too many redirects.");
}

/** Reduces a page to its readable text (headline and paragraphs), with an upper length. */
export function pageToText(html: string, maxChars = 12_000): { title: string; text: string; published?: string; siteName?: string } {
  const title = (/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] ?? /<title[^>]*>([^<]+)/i.exec(html)?.[1] ?? "").trim();
  const published =
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] ??
    /<time[^>]+datetime=["']([^"']+)/i.exec(html)?.[1];
  // Many news sites put the whole article in structured data as well ("articleBody").
  let ld = "";
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          if (typeof o.articleBody === "string" && o.articleBody.length > ld.length) ld = o.articleBody;
          Object.values(o).forEach(walk);
        }
      };
      walk(JSON.parse(m[1]));
    } catch { /* not valid JSON: ignore */ }
  }
  const description = /<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)/i.exec(html)?.[1] ?? "";
  const siteName = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  const body = (/<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html)
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const paragraphs = [...body.matchAll(/<(p|h1|h2|h3|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 40);
  const fromParagraphs = paragraphs.join("\n");
  const best = [decode(ld).replace(/\s+/g, " ").trim(), fromParagraphs].sort((a, b) => b.length - a.length)[0];
  const text = ((best.length >= 500 ? best : `${decode(description)}\n${best}`.trim() || decode(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " "))).slice(0, maxChars);
  return { title: decode(title), text, published, siteName: siteName ? decode(siteName) : undefined };
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)));
}
