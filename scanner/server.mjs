import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import * as clamd from "./clamd.mjs";
import { readStaging, stagingSize, copyToMain, copyToInternetArchive } from "./storage.mjs";

// The AOEhub virus scanner. The hub asks it to scan one file that is waiting in
// the private staging bucket; if the file is clean it also moves it to its
// final place (so the hub never has to carry big files itself).
//
//   POST /scan   Authorization: Bearer <SCANNER_SECRET>
//   { assetId, stagingKey, size, contentType, finalBackend: "r2" | "internet-archive" | "none", finalKey }
//   -> { status: "clean" | "flagged" | "error", signature?, code?, message?, finalBackend?, finalKey? }
//   GET /healthz -> engine status

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.SCANNER_SECRET || "";
const MAX_BYTES = Number(process.env.SCAN_MAX_BYTES || 2047 * 1024 * 1024); // ClamAV cannot scan 2 GiB or more (hub limit 1 GB; one-time lifts up to 2047 MB)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const log = (...a) => console.log(new Date().toISOString(), ...a);

function authorized(req) {
  const given = Buffer.from(String(req.headers.authorization || ""));
  const want = Buffer.from(`Bearer ${SECRET}`);
  return SECRET.length >= 24 && given.length === want.length && timingSafeEqual(given, want);
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

  // Look at the staged file. Only a clear "not found" means it is missing; any other trouble talking to storage is worth trying again.
  let actual;
  let lastError;
  for (let attempt = 0; attempt < 3 && actual === undefined; attempt++) {
    try {
      actual = await stagingSize(stagingKey);
    } catch (err) {
      lastError = err;
      const status = err?.$metadata?.httpStatusCode;
      if (status === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
        return { status: "error", code: "missing", message: "The file is not in staging." };
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  if (actual === undefined) return { status: "error", code: "storage-error", message: `Could not reach storage (${lastError?.name ?? "error"}).` };
  if (actual !== size) return { status: "error", code: "size-mismatch", message: `Expected ${size} bytes, found ${actual}.` };

  const started = Date.now();
  const stream = await readStaging(stagingKey);
  const result = await clamd.scanStream(stream);
  log(`scan ${assetId} ${size}B -> ${result.status}${result.signature ? " " + result.signature : ""} in ${Date.now() - started}ms`);
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
    if (req.method === "GET" && req.url === "/healthz") {
      const ready = await clamd.isReady();
      let version = null;
      if (ready) version = await clamd.command("VERSION", 3000).catch(() => null);
      return send(res, ready ? 200 : 503, { ok: ready, engine: version });
    }
    if (req.method === "POST" && req.url === "/scan") {
      if (!authorized(req)) return send(res, 401, { error: "Unauthorized" });
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
