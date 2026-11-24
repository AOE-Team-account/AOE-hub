import { isIP } from "node:net";

// The visitor's address, for rate limits (AOE-SEC-04).
//
// Only an address added by OUR OWN proxy can be trusted; anything a visitor sends
// can be made up. Two settings choose which one that is (check on the live host):
//   CLIENT_IP_HEADER     a header the host itself sets and overwrites, e.g.
//                        "cf-connecting-ip" behind Cloudflare, or "x-real-ip".
//                        When set, only that header is used.
//   TRUSTED_PROXY_COUNT  otherwise: how many proxies of ours append to
//                        X-Forwarded-For (default 1). The client is the entry that
//                        many places from the right; entries further left are ignored.
// An unusable value gives "unknown", which shares one strict bucket with every
// other unknown visitor, so faking the header never earns a fresh allowance.
const HEADER = (process.env.CLIENT_IP_HEADER ?? "").trim().toLowerCase();
const HOPS = Math.min(5, Math.max(1, Number(process.env.TRUSTED_PROXY_COUNT) || 1));

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  if (v.startsWith("[") && v.includes("]")) v = v.slice(1, v.indexOf("]")); // [ipv6]:port
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(v)) v = v.split(":")[0]; // ipv4:port
  if (v.toLowerCase().startsWith("::ffff:") && isIP(v.slice(7)) === 4) v = v.slice(7);
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind === 6) {
    // One person usually holds a whole /64, so limits count per /64.
    const full = expandIpv6(v);
    return full ? full.split(":").slice(0, 4).join(":") + "::/64" : null;
  }
  return null;
}

function expandIpv6(v: string): string | null {
  const [head, tail] = v.split("::");
  if (v.split("::").length > 2) return null;
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  if (t.some((x) => x.includes(".")) || h.some((x) => x.includes("."))) return null;
  const missing = 8 - h.length - t.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  return [...h, ...Array(tail === undefined ? 0 : missing).fill("0"), ...t].map((x) => x.padStart(4, "0").toLowerCase()).join(":");
}

export function clientIp(request: Request): string {
  if (HEADER) return clean(request.headers.get(HEADER)) ?? "unknown";
  const list = (request.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length >= HOPS) return clean(list[list.length - HOPS]) ?? "unknown";
  return clean(request.headers.get("x-real-ip")) ?? "unknown";
}
