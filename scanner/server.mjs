import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import * as clamd from "./clamd.mjs";
import { sourceSize, readSource, readSourceRange, copyToMain, copyToInternetArchive } from "./storage.mjs";
import { sniff, disguisedProgram, inspectZip, pdfTap, pdfVerdict } from "./inspect.mjs";

// The AOEhub virus scanner. The hub asks it to scan one file that is waiting in
// the private staging bucket; if the file is clean it also moves it to its
// final place (so the hub never has to carry big files itself).
//
//   POST /scan   Authorization: Bearer <SCANNER_SECRET>
//   { assetId, stagingKey, size, contentType, finalBackend: "r2" | "internet-archive" | "none", finalKey,
//     name, allowScripts, source: "staging" (default) | "main" | "internet-archive" }  (stagingKey is the key in that source)
//   -> { status: "clean" | "flagged" | "error", signature?, code?, message?, finalBackend?, finalKey? }
//   GET /healthz -> engine status

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.SCANNER_SECRET || "";
const MAX_BYTES = Number(process.env.SCAN_MAX_BYTES || 2047 * 1024 * 1024); // ClamAV cannot scan 2 GiB or more (hub limit 1 GB; one-time lifts up to 2047 MB)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const log = (...a) => console.log(new Date().toISOString(), ...a);

// Wrong-secret guard. An address that sends the wrong secret 5 times within 10 minutes is refused for
// 30 minutes with an instant answer (no work, no engine start). Kept in memory only; never written anywhere.
const MAX_WRONG = 5;
const WRONG_WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 30 * 60 * 1000;
const wrongTries = new Map(); // address -> { count, first, blockedUntil }

function clientAddress(req) {
  // Cloud Run puts the real caller last in X-Forwarded-For (anything before it can be faked by the caller).
  const parts = String(req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] || req.socket.remoteAddress || "unknown";
}

function isBlocked(req) {
  const e = wrongTries.get(clientAddress(req));
  return !!e && e.blockedUntil > Date.now();
}

function noteWrongSecret(req) {
  const now = Date.now();
  if (wrongTries.size > 5000) for (const [k, v] of wrongTries) if (v.blockedUntil < now && now - v.first > WRONG_WINDOW_MS) wrongTries.delete(k);
  const ip = clientAddress(req);
  let e = wrongTries.get(ip);
  if (!e || (e.blockedUntil < now && now - e.first > WRONG_WINDOW_MS)) e = { count: 0, first: now, blockedUntil: 0 };
  e.count += 1;
  if (e.count >= MAX_WRONG) { e.blockedUntil = now + BLOCK_MS; e.count = 0; e.first = now; log(`address blocked for 30 min after repeated wrong secrets: ${ip}`); }
  wrongTries.set(ip, e);
}

// The ClamAV engine is only started once someone with the right secret asks (see start.sh), so a stranger
// poking the scanner costs a second of a tiny start-up, not 20 seconds of the full engine.
let engineRequested = false;
function wakeEngine() {
  if (engineRequested) return;
  engineRequested = true;
  try { fs.writeFileSync("/tmp/engine-wanted", "1"); } catch (err) { log("could not wake the engine:", err instanceof Error ? err.message : err); }
}

// Returns true when the request carries the right secret. Otherwise it has already answered (401 or 429).
function checkAccess(req, res) {
  if (isBlocked(req)) { send(res, 429, { error: "Too many wrong tries. Try again later." }); return false; }
  const given = Buffer.from(String(req.headers.authorization || ""));
  const want = Buffer.from(`Bearer ${SECRET}`);
  if (SECRET.length >= 24 && given.length === want.length && timingSafeEqual(given, want)) { wakeEngine(); return true; }
  noteWrongSecret(req);
  send(res, 401, { error: "Unauthorized" });
  return false;
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(text);
}

async function readJson(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function scanOne(job) {
  const { assetId, stagingKey, size, contentType, finalBackend, finalKey } = job;
  // Where to read the file: a new upload waits in staging; a stored file being re-checked
  // is read where it lives ("main" bucket or "internet-archive").
  const source = ["main", "internet-archive"].includes(job.source) ? job.source : "staging";
  const name = typeof job.name === "string" ? job.name.slice(0, 300) : "";
  const allowScripts = job.allowScripts === true;
  if (!UUID.test(String(assetId)) || typeof stagingKey !== "string" || !stagingKey || stagingKey.includes("..") || stagingKey.length > 700) {
    return { status: "error", code: "bad-request", message: "Invalid request." };
  }
  if (!["r2", "internet-archive", "none"].includes(finalBackend)) return { status: "error", code: "bad-request", message: "Invalid destination." };
  if (finalBackend !== "none" && (typeof finalKey !== "string" || !finalKey || finalKey.includes("..") || finalKey.length > 700)) {
    return { status: "error", code: "bad-request", message: "Invalid destination." };
  }
  if (!Number.isFinite(size) || size <= 0) return { status: "error", code: "bad-request", message: "Invalid size." };
  if (size > MAX_BYTES) return { status: "error", code: "too-big", message: "File is over the scan limit." };

  if (!(await clamd.waitUntilReady(150_000))) return { status: "error", code: "engine-not-ready", message: "The scanner engine is not ready yet." };

  // Look at the file in storage. Only a clear "not found" means it is missing; any other trouble talking to storage is worth trying again.
  let actual;
  let lastError;
  for (let attempt = 0; attempt < 3 && actual === undefined; attempt++) {
    try {
      actual = await sourceSize(source, stagingKey);
    } catch (err) {
      lastError = err;
      const status = err?.$metadata?.httpStatusCode;
      if (status === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
        return { status: "error", code: "missing", message: "The file is not there." };
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  if (actual === undefined) return { status: "error", code: "storage-error", message: `Could not reach storage (${lastError?.name ?? "error"}).` };
  if (actual !== size) return { status: "error", code: "size-mismatch", message: `Expected ${size} bytes, found ${actual}.` };

  const started = Date.now();
  const flagged = (signature) => {
    log(`scan ${assetId} ${size}B -> flagged ${signature} (our own check) in ${Date.now() - started}ms`);
    return { status: "flagged", signature };
  };

  // Our own checks first: they do not need to know the threat in advance.
  let kind = null;
  try {
    const head = await readSourceRange(source, stagingKey, 0, Math.min(size, 4096) - 1);
    kind = sniff(head);
    const disguised = disguisedProgram(name, kind);
    if (disguised) return flagged(disguised);
    if (kind === "zip") {
      const z = await inspectZip(size, (a, b) => readSourceRange(source, stagingKey, a, b), { allowScripts });
      if (z.flagged) return flagged(z.signature);
    }
  } catch (err) {
    // A problem reading storage here is not a verdict; the engine scan below will report it.
    log(`inspection skipped for ${assetId}:`, err instanceof Error ? err.message : err);
  }

  const found = {};
  let stream = await readSource(source, stagingKey);
  if (kind === "pdf") stream = pdfTap(stream, found);
  const result = await clamd.scanStream(stream);
  if (result.status === "clean" && kind === "pdf") {
    const verdict = pdfVerdict(found);
    if (verdict) return flagged(verdict);
  }
  log(`scan ${assetId} ${size}B (${source}) -> ${result.status}${result.signature ? " " + result.signature : ""} in ${Date.now() - started}ms`);
  if (result.status !== "clean") {
    return result.status === "flagged"
      ? { status: "flagged", signature: result.signature }
      : { status: "error", code: "engine-error", message: result.message };
  }

  if (finalBackend === "none") return { status: "clean", finalBackend: "none" };
  try {
    if (finalBackend === "r2") await copyToMain(stagingKey, finalKey);
    else await copyToInternetArchive(stagingKey, finalKey, contentType, size);
  } catch (err) {
    log(`promote failed for ${assetId}:`, err instanceof Error ? err.message : err);
    return { status: "error", code: "promote-failed", message: "The file is clean but could not be moved to its final place." };
  }
  return { status: "clean", finalBackend, finalKey };
}

const server = http.createServer(async (req, res) => {
  try {
    // (Google's front door keeps "/healthz" for itself on Cloud Run, so the status page is "/status".)
    if (req.method === "GET" && req.url === "/layers") {
      if (!checkAccess(req, res)) return;
      // Which signature collections the engine has loaded right now (names only).
      const files = fs.existsSync("/var/lib/clamav") ? fs.readdirSync("/var/lib/clamav").filter((f) => /\.(cvd|cld|ndb|hdb|hsb|ldb|cdb|ign2|fp|yara|yar|db|ftm|pdb|wdb|mdb|msb|idb)$/.test(f)) : [];
      const stats = await clamd.command("STATS", 3000).catch(() => null);
      return send(res, 200, { files: files.sort(), count: files.length, engine: await clamd.command("VERSION", 3000).catch(() => null), stats: stats ? stats.split("\n").slice(0, 8) : null });
    }
    if (req.method === "GET" && (req.url === "/status" || req.url === "/healthz")) {
      const ready = await clamd.isReady();
      let version = null;
      if (ready) version = await clamd.command("VERSION", 3000).catch(() => null);
      return send(res, ready ? 200 : 503, { ok: ready, engine: version });
    }
    if (req.method === "POST" && req.url === "/scan") {
      if (!checkAccess(req, res)) return;
      let job;
      try { job = await readJson(req); } catch { return send(res, 400, { status: "error", code: "bad-request", message: "Invalid request." }); }
      const out = await scanOne(job).catch((err) => {
        log("scan crashed:", err instanceof Error ? err.stack : err);
        return { status: "error", code: "crashed", message: "The scanner had a problem." };
      });
      return send(res, 200, out);
    }
    send(res, 404, { error: "Not found" });
  } catch (err) {
    log("request failed:", err instanceof Error ? err.message : err);
    if (!res.headersSent) send(res, 500, { status: "error", code: "crashed", message: "The scanner had a problem." });
  }
});

server.requestTimeout = 0; // a big file can take a while; Cloud Run enforces its own limit
server.headersTimeout = 30_000;
server.listen(PORT, () => log(`scanner listening on ${PORT}`));
