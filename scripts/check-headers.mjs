#!/usr/bin/env node
// Checks that a running copy of the hub sends every security header.
//   node scripts/check-headers.mjs https://aoe.name            (test site: must be noindex)
//   node scripts/check-headers.mjs https://aoe.ai --public     (official site: must NOT be noindex)
//   node scripts/check-headers.mjs http://localhost:3100 --private
// Run it again after every deploy, on the test site and on the official site.
const [base, mode] = [process.argv[2], process.argv[3]];
if (!base) { console.error("Usage: node scripts/check-headers.mjs <address> [--private|--public]"); process.exit(2); }
const root = base.replace(/\/+$/, "");
let failed = 0;
const ok = (good, label, detail = "") => { if (!good) failed++; console.log(`${good ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`); };

async function head(path, init = {}) { return fetch(root + path, { redirect: "manual", ...init }); }

for (const path of ["/", "/login", "/policy/terms", "/no-such-page-xyz", "/api/my-data"]) {
  const r = await head(path);
  const h = (n) => r.headers.get(n) ?? "";
  console.log(`\n${path}  (HTTP ${r.status})`);
  const csp = h("content-security-policy");
  ok(/max-age=\d{7,}/.test(h("strict-transport-security")), "Strict-Transport-Security (HTTPS only)", h("strict-transport-security"));
  ok(/frame-ancestors 'none'/.test(csp), "CSP: nobody may frame the hub");
  ok(/img-src [^;]*r2\.cloudflarestorage\.com/.test(csp) && /connect-src [^;]*r2\.cloudflarestorage\.com/.test(csp), "CSP: pictures, videos and uploads may use our own file store");
  ok(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp) && !/script-src[^;]*'unsafe-eval'/.test(csp), "CSP: scripts need a one-time nonce (no unsafe-inline / unsafe-eval)");
  ok(/object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp), "CSP: no plugins, fixed base address, forms only to ourselves");
  ok(/default-src 'self'/.test(csp), "CSP: default is ourselves only");
  ok(h("x-frame-options").toUpperCase() === "DENY", "X-Frame-Options: DENY");
  ok(h("x-content-type-options").toLowerCase() === "nosniff", "X-Content-Type-Options: nosniff");
  ok(!!h("referrer-policy"), "Referrer-Policy", h("referrer-policy"));
  ok(/camera=\(\)/.test(h("permissions-policy")) && /microphone=\(\)/.test(h("permissions-policy")) && /geolocation=\(\)/.test(h("permissions-policy")), "Permissions-Policy: camera, microphone, location off");
  ok(!h("x-powered-by"), "No X-Powered-By (framework not announced)");
  const noindex = /noindex/i.test(h("x-robots-tag"));
  if (mode === "--private") ok(noindex, "X-Robots-Tag: noindex (test site)", h("x-robots-tag"));
  if (mode === "--public") ok(!noindex, "Not marked noindex (official site)");
}

const robots = await (await head("/robots.txt")).text();
console.log("\n/robots.txt");
if (mode === "--private") ok(/Disallow:\s*\/\s*$/m.test(robots), "robots.txt refuses everything (test site)");
if (mode === "--public") ok(/Allow:\s*\//.test(robots) && !/Disallow:\s*\/\s*$/m.test(robots), "robots.txt allows the public pages (official site)");

// A forged address must not be able to add rules to the policy.
const forged = await head("/", { headers: { host: "evil.example; script-src *" } }).catch(() => null);
if (forged) {
  const c = forged.headers.get("content-security-policy") ?? "";
  console.log("\nForged Host header");
  ok(!/script-src \*/.test(c), "A forged Host header cannot add rules to the CSP");
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
