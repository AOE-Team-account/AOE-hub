#!/usr/bin/env node
// Imports a big folder of files into the hub as posts, through the hub's own
// upload system (so every check applies: limits, blocked file types, the virus
// scan). Run it from your computer.
//
//   node scripts/bulk-import.mjs "/path/to/folder" [--site https://aoe.name] [--dry-run]
//        [--section curriculum] [--media document] [--authorship original] [--ai]
//
// Folder layout: every sub-folder becomes ONE post (its title is the folder name)
// holding the files inside it. Optional files in a sub-folder:
//   post.json         { "title": "...", "description": "...", "section": "...", "mediaType": "...", "authorship": "...", "madeWithAi": false }
//   description.txt   the description (otherwise a short default is used)
// Loose files directly in the folder each become their own post.
//
// It signs in as an ordinary member account (the Creator account cannot post), so
// raise that member's daily upload limit first (Creator panel, People, Upload limit).
// Safe to stop and run again: finished posts are remembered in .bulk-import-done.json.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--") && !isFlagValue(a));
function isFlagValue(a) { const i = args.indexOf(a); return i > 0 && ["--site", "--section", "--media", "--authorship"].includes(args[i - 1]); }
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes("--dry-run");
const SITE = (flag("--site", "http://localhost:3000") || "").replace(/\/+$/, "");
const SECTION = flag("--section", "other");
const MEDIA = flag("--media", "document");
const AUTHORSHIP = flag("--authorship", "original");
const AI = args.includes("--ai");

const SECTIONS = ["curriculum", "games", "books", "cards", "songs", "art", "printables", "apps", "other"];
const MEDIAS = ["document", "image", "audio", "video", "game", "app", "other"];
const AUTHORSHIPS = ["original", "remix", "notmine"];
const BLOCKED = ["exe","msi","bat","cmd","com","scr","pif","js","jse","vbs","vbe","wsf","wsh","ps1","psm1","jar","apk","dmg","pkg","sh","lnk","reg","hta","cpl","dll","sys","scf","inf","msp","gadget"];
const MIME = { pdf: "application/pdf", epub: "application/epub+zip", txt: "text/plain", md: "text/markdown", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", csv: "text/csv" };
const mimeOf = (name) => MIME[(name.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
const GB = 1024 * 1024 * 1024;
const MAX_FILE = Number(process.env.IMPORT_MAX_FILE_BYTES || GB);

const say = (...a) => console.log(...a);
const fmt = (n) => (n >= GB ? (n / GB).toFixed(2) + " GB" : n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  say("Usage: node scripts/bulk-import.mjs \"/path/to/folder\" [--site https://aoe.name] [--dry-run] [--section ...] [--media ...] [--authorship ...] [--ai]");
  process.exit(1);
}
for (const [v, list, n] of [[SECTION, SECTIONS, "--section"], [MEDIA, MEDIAS, "--media"], [AUTHORSHIP, AUTHORSHIPS, "--authorship"]]) {
  if (!list.includes(v)) { say(`${n} must be one of: ${list.join(", ")}`); process.exit(1); }
}

// ---- read the folder into posts ----
function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith(".") && !["post.json", "description.txt"].includes(e.name))
    .map((e) => ({ name: e.name, path: path.join(dir, e.name), size: fs.statSync(path.join(dir, e.name)).size }));
}
const posts = [];
for (const e of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (e.name.startsWith(".")) continue;
  const p = path.join(folder, e.name);
  if (e.isDirectory()) {
    const files = filesIn(p);
    if (files.length === 0) continue;
    let meta = {};
    if (fs.existsSync(path.join(p, "post.json"))) { try { meta = JSON.parse(fs.readFileSync(path.join(p, "post.json"), "utf8")); } catch { say(`Cannot read post.json in "${e.name}", skipping that folder.`); continue; } }
    const description = meta.description || (fs.existsSync(path.join(p, "description.txt")) ? fs.readFileSync(path.join(p, "description.txt"), "utf8").trim() : "") || `${e.name}.`;
    posts.push({ key: e.name, title: String(meta.title || e.name).slice(0, 200), description: description.slice(0, 5000), section: meta.section || SECTION, mediaType: meta.mediaType || MEDIA, authorship: meta.authorship || AUTHORSHIP, madeWithAi: meta.madeWithAi ?? AI, files });
  } else if (e.isFile()) {
    const f = { name: e.name, path: p, size: fs.statSync(p).size };
    const title = e.name.replace(/\.[^.]+$/, "");
    posts.push({ key: e.name, title: title.slice(0, 200), description: `${title}.`, section: SECTION, mediaType: MEDIA, authorship: AUTHORSHIP, madeWithAi: AI, files: [f] });
  }
}

// ---- check everything before sending anything ----
let problems = 0;
let totalBytes = 0;
for (const p of posts) {
  if (!SECTIONS.includes(p.section) || !MEDIAS.includes(p.mediaType) || !AUTHORSHIPS.includes(p.authorship)) { say(`✗ "${p.key}": section, mediaType or authorship is not one of the allowed values.`); problems++; }
  if (p.files.length > 20) { say(`✗ "${p.key}": more than 20 files (split it into two folders).`); problems++; }
  for (const f of p.files) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (BLOCKED.includes(ext)) { say(`✗ "${p.key}/${f.name}": programs and scripts are not accepted.`); problems++; }
    if (f.size > MAX_FILE) { say(`✗ "${p.key}/${f.name}": ${fmt(f.size)} is over the limit of ${fmt(MAX_FILE)} (split it, or ask for a one-time lift).`); problems++; }
    if (f.size === 0) { say(`✗ "${p.key}/${f.name}": the file is empty.`); problems++; }
    totalBytes += f.size;
  }
}
say(`Found ${posts.length} posts, ${posts.reduce((n, p) => n + p.files.length, 0)} files, ${fmt(totalBytes)} in total.`);
if (problems > 0) { say(`\n${problems} problem(s) above. Fix them and run again.`); process.exit(1); }
if (DRY) { for (const p of posts) say(`  • ${p.title}  [${p.section}/${p.mediaType}/${p.authorship}]  ${p.files.length} file(s), ${fmt(p.files.reduce((n, f) => n + f.size, 0))}`); say("\nDry run: nothing was sent."); process.exit(0); }

// ---- sign in as the content account ----
const env = Object.fromEntries((fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPA || !ANON) { say("Run this from the project folder (it needs .env.local)."); process.exit(1); }
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); else if (s.includes("\n")) process.stdout.write("\n"); }; }
    rl.question(question, (a) => { rl.close(); resolve(a); });
  });
}
const email = process.env.IMPORT_EMAIL || (await ask("Email of the member account to post as: "));
const password = process.env.IMPORT_PASSWORD || (await ask("Its password (not shown): ", true));
const supabase = createClient(SUPA, ANON, { auth: { persistSession: false } });
const { error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
if (signErr) { say("Could not sign in: " + signErr.message); process.exit(1); }
const ref = new URL(SUPA).hostname.split(".")[0];
const cookieFor = async () => {
  const { data } = await supabase.auth.getSession(); // refreshes when needed
  return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
};
const api = async (route, body) => {
  const res = await fetch(SITE + route, { method: "POST", headers: { "content-type": "application/json", cookie: await cookieFor() }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

// ---- send ----
const DONE = ".bulk-import-done.json";
const done = new Set(fs.existsSync(DONE) ? JSON.parse(fs.readFileSync(DONE, "utf8")) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function put(url, body, type) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { method: "PUT", headers: type ? { "content-type": type } : {}, body, duplex: "half" });
      if (res.ok) return res.headers.get("etag");
      if (res.status < 500 && res.status !== 429) throw new Error(`storage answered ${res.status}`);
    } catch (e) { if (i === 4) throw e; }
    await sleep(2000 * (i + 1));
  }
  throw new Error("storage kept failing");
}
const results = { posted: 0, flagged: [], failed: [] };
let sent = 0;
for (const [index, p] of posts.entries()) {
  if (done.has(p.key)) { say(`[${index + 1}/${posts.length}] skipping "${p.title}" (already done)`); continue; }
  say(`[${index + 1}/${posts.length}] ${p.title}  (${p.files.length} file(s))`);
  try {
    const init = await api("/api/upload/init", {
      title: p.title, description: p.description, section: p.section, mediaType: p.mediaType, authorship: p.authorship, madeWithAi: p.madeWithAi,
      labels: p.files.map((f) => f.name), files: p.files.map((f) => ({ name: f.name, size: f.size, type: mimeOf(f.name) })), links: [],
    });
    if (init.status !== 200) {
      if (init.data.code === "daily-limit") { say("  The member's daily upload limit is reached. Raise it in the Creator panel (People, Upload limit) and run again."); process.exit(2); }
      throw new Error(init.data.error || `init answered ${init.status}`);
    }
    const sentParts = [];
    for (const [i, ins] of init.data.files.entries()) {
      const f = p.files[i];
      const fd = fs.openSync(f.path, "r");
      try {
        if (ins.upload.mode === "single") {
          await put(ins.upload.url, fs.readFileSync(f.path), ins.type);
          sentParts.push({ assetId: ins.assetId, parts: [] });
        } else {
          const parts = [];
          for (let n = 0; n < ins.upload.urls.length; n++) {
            const len = Math.min(ins.upload.partSize, f.size - n * ins.upload.partSize);
            const buf = Buffer.alloc(len);
            fs.readSync(fd, buf, 0, len, n * ins.upload.partSize);
            const etag = await put(ins.upload.urls[n], buf, null);
            if (!etag) throw new Error("no receipt for a part (check the staging bucket's CORS setting)");
            parts.push({ PartNumber: n + 1, ETag: etag });
            process.stdout.write(`\r    ${f.name}: part ${n + 1}/${ins.upload.urls.length}   `);
          }
          process.stdout.write("\n");
          sentParts.push({ assetId: ins.assetId, parts });
        }
      } finally { fs.closeSync(fd); }
      sent += f.size;
      say(`    sent ${f.name} (${fmt(f.size)}); ${fmt(sent)} of ${fmt(totalBytes)} so far`);
    }
    const fin = await api("/api/upload/complete", { postId: init.data.postId, files: sentParts });
    const bad = (fin.data.results || []).filter((r) => r.status === "failed");
    if (fin.status !== 200 || bad.length) throw new Error(bad[0]?.error || `complete answered ${fin.status}`);
    results.posted++;
    done.add(p.key);
    fs.writeFileSync(DONE, JSON.stringify([...done], null, 1));
    p.postId = init.data.postId;
  } catch (e) {
    say(`  ✗ failed: ${e.message}`);
    results.failed.push(p.key);
  }
}

// ---- wait for the virus scans and report ----
const postIds = posts.filter((p) => p.postId).map((p) => p.postId);
if (postIds.length) {
  say("\nWaiting for the virus scans (this can take a few minutes)...");
  for (let round = 0; round < 90; round++) {
    const { data } = await supabase.from("file_assets").select("id, label, scan_status, file_post_id").in("file_post_id", postIds);
    const open = (data || []).filter((a) => a.scan_status === "uploading" || a.scan_status === "pending");
    if (open.length === 0) {
      const flagged = (data || []).filter((a) => a.scan_status === "flagged");
      const errors = (data || []).filter((a) => a.scan_status === "error");
      results.flagged = flagged.map((a) => a.label);
      say(`Scans finished: ${(data || []).filter((a) => a.scan_status === "clean").length} clean, ${flagged.length} caught, ${errors.length} failed.`);
      flagged.forEach((a) => say(`  ✗ caught by the scanner: ${a.label}`));
      errors.forEach((a) => say(`  ✗ failed (upload it again): ${a.label}`));
      break;
    }
    if (round % 6 === 0) say(`  ${open.length} file(s) still being checked...`);
    await sleep(10_000);
  }
}
say(`\nDone: ${results.posted} post(s) created, ${results.failed.length} failed.`);
if (results.failed.length) say("Run the same command again to retry the failed ones.");
