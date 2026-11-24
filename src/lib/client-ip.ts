import { isIP } from "node:net";

// The visitor's address, for rate limits (AOE-SEC-04, SEC-24).
//
// Fail safe: a header a visitor sends (X-Forwarded-For, X-Real-IP, ...) can be made
// up, so NO header is trusted unless the host's settings say which one our own proxy
// writes. Check the live host, then set ONE of:
//   CLIENT_IP_HEADER     a header the proxy itself sets and overwrites, e.g.
//                        "cf-connecting-ip" behind Cloudflare, or "x-real-ip" when
//                        Apache/nginx sets it. Only that header is read.
//   TRUSTED_PROXY_COUNT  how many proxies of ours APPEND to X-Forwarded-For (1-5).
//                        The client is the entry that many places from the right;
//                        anything further left (what the visitor sent) is ignored.
// With neither set, clientIp() returns null ("address unknown"). Callers then treat
// the visitor strictly: signed-out AI questions need sign-in, and the few other
// signed-out actions share one small, separate allowance. A missing or malformed
// value also gives null; there is no shared "unknown" address.
const HEADER = (process.env.CLIENT_IP_HEADER ?? "").trim().toLowerCase();
const HOPS_RAW = (process.env.TRUSTED_PROXY_COUNT ?? "").trim();
const HOPS = /^[1-5]$/.test(HOPS_RAW) ? Number(HOPS_RAW) : 0;

/** True when the host has said how to find the real visitor address. */
export const clientIpConfigured = HEADER !== "" || HOPS > 0;

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    HOPS_RAW && !HOPS
      ? "TRUSTED_PROXY_COUNT must be a number from 1 to 5; visitor addresses are ignored until it is fixed."
      : "CLIENT_IP_HEADER / TRUSTED_PROXY_COUNT not set: visitor address headers are ignored (signed-out AI questions need sign-in). See .env.example."
  );
}

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

/** The visitor's address (IPv6 as its /64), or null when it can't be known safely. */
export function clientIp(request: Request): string | null {
  if (HEADER) return clean(request.headers.get(HEADER));
  if (HOPS > 0) {
    const list = (request.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return list.length >= HOPS ? clean(list[list.length - HOPS]) : null;
  }
  warnOnce();
  return null;
}

/** The wider network an address belongs to (IPv4 /24, IPv6 /48), for per-network shares. */
export function clientNetwork(ip: string): string {
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::/48";
  return ip.split(".").slice(0, 3).join(".") + ".0/24";
}
