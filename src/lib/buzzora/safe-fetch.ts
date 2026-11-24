import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

// Fetching a page whose address came from the internet is a classic attack
// route (making the server call something inside its own network). Every
// address is checked before it is fetched, and again after each redirect:
// plain https only, no passwords in the address, only hosts the caller allows,
// and the host must resolve to public internet addresses only. The connection
// then goes to the very address that was checked (AOE-SEC-16), so a second DNS
// answer (DNS rebinding) cannot point it somewhere else.

// Two lists: Node matches IPv4 addresses against IPv4-mapped IPv6 ranges too.
const blocked4 = new net.BlockList();
const blocked6 = new net.BlockList();
for (const [a, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as [string, number][]) blocked4.addSubnet(a, p, "ipv4");
for (const [a, p] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as [string, number][]) blocked6.addSubnet(a, p, "ipv6");

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return blocked4.check(ip, "ipv4");
  if (!net.isIPv6(ip)) return true;
  const v = ip.toLowerCase();
  // IPv4 written inside IPv6 (::ffff:10.0.0.1 or ::ffff:a00:1): judge the IPv4 part.
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  // Any other IPv4-mapped form (::ffff:a00:1) is inside ::ffff:0:0/96 and refused.
  return blocked6.check(v, "ipv6");
}

async function assertSafe(rawUrl: string, allowHost: (host: string) => boolean): Promise<{ url: URL; address: string; family: number }> {
  const u = new URL(rawUrl);
  if (u.protocol !== "https:") throw new Error("Only https addresses are allowed.");
  if (u.username || u.password) throw new Error("Addresses with a password are not allowed.");
  if (u.port && u.port !== "443") throw new Error("Unusual ports are not allowed.");
  const host = u.hostname.toLowerCase();
  if (net.isIP(host) || !allowHost(host)) throw new Error("That site is not on the allowed list.");
  const addrs = await dns.lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("That address is not a public one.");
  return { url: u, address: addrs[0].address, family: addrs[0].family };
}

export interface SafeText { url: string; status: number; contentType: string; text: string }

/** One GET to the checked address only (the name is still used for TLS and the Host header). */
function getPinned(url: URL, address: string, family: number, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Readable }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers,
        timeout: timeoutMs,
        lookup: (_host, opts, cb) => {
          const o = opts as { all?: boolean };
          if (o?.all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
          else cb(null, address, family);
        },
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res })
    );
    req.on("timeout", () => req.destroy(new Error("The site took too long to answer.")));
    req.on("error", reject);
  });
}

/** Fetches a page as text, with a size cap and timeout, following up to 3 redirects that are each re-checked. */
export async function safeFetchText(
  rawUrl: string,
  allowHost: (host: string) => boolean,
  opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {}
): Promise<SafeText> {
  const maxBytes = opts.maxBytes ?? 1_500_000;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let current = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const { url: u, address, family } = await assertSafe(current, allowHost);
    const res = await getPinned(u, address, family, {
      "user-agent": "AOEhubBot/1.0 (+https://aoe.ai)",
      accept: opts.accept ?? "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
      "accept-encoding": "gzip, deflate, br",
    }, timeoutMs);
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && typeof location === "string" && location) {
      res.body.resume();
      current = new URL(location, u).toString();
      continue;
    }
    const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
    let stream: Readable = res.body;
    if (enc === "gzip" || enc === "x-gzip") stream = res.body.pipe(zlib.createGunzip());
    else if (enc === "deflate") stream = res.body.pipe(zlib.createInflate());
    else if (enc === "br") stream = res.body.pipe(zlib.createBrotliDecompress());
    let received = 0;
    const chunks: Buffer[] = [];
    const deadline = setTimeout(() => res.body.destroy(new Error("The site took too long to answer.")), timeoutMs);
    try {
      for await (const chunk of stream) {
        const b = chunk as Buffer;
        received += b.length;
        if (received > maxBytes) { res.body.destroy(); break; }
        chunks.push(b);
      }
    } catch (err) {
      if (chunks.length === 0) throw err;
    } finally {
      clearTimeout(deadline);
    }
    const ct = res.headers["content-type"];
    return { url: u.toString(), status: res.status, contentType: typeof ct === "string" ? ct : "", text: Buffer.concat(chunks).toString("utf8") };
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
