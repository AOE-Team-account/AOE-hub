import { unzipSync } from "fflate";

// Hosted games (Step 7): a member uploads one .zip with an index.html at the
// top; the hub unpacks it into storage and serves it from its own separate
// "play." address, inside a sandbox, once it has passed the malware check.

/** The most a hosted game (the .zip) may be. Bigger games link out. */
export const GAME_MAX_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 1500;
const MAX_UNPACKED_BYTES = 150 * 1024 * 1024;

export class GameZipError extends Error {
  constructor(readonly code: "bad-zip" | "too-many-files" | "too-big" | "bad-path" | "blocked-type", message: string) {
    super(message);
  }
}

export interface GameFile {
  path: string;
  data: Uint8Array;
  mime: string;
}

const BLOCKED = new Set(["exe", "dll", "bat", "cmd", "com", "scr", "msi", "sh", "php", "jar", "apk", "vbs", "ps1", "app", "dmg", "pif"]);

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json", map: "application/json",
  txt: "text/plain; charset=utf-8", xml: "application/xml", csv: "text/csv",
  wasm: "application/wasm",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon", bmp: "image/bmp",
  mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", opus: "audio/ogg",
  mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  glb: "model/gltf-binary", gltf: "model/gltf+json",
};

export function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

function cleanPath(name: string): string | null {
  const p = name.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.endsWith("/")) return null; // a folder entry
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.includes("\0")) throw new GameZipError("bad-path", `Unsafe file name: ${name.slice(0, 60)}`);
  const parts = p.split("/");
  if (parts.some((s) => s === ".." || s.length === 0 || s.length > 200)) throw new GameZipError("bad-path", `Unsafe file name: ${name.slice(0, 60)}`);
  if (p.length > 400) throw new GameZipError("bad-path", "A file name is too long.");
  const base = parts[parts.length - 1];
  if (parts[0] === "__MACOSX" || base === ".DS_Store" || base === "Thumbs.db") return null;
  return p;
}

/**
 * Looks inside a .zip. Returns the files when it is a playable game (an
 * index.html at the top, or inside the single folder that holds everything),
 * or null when it is just an ordinary zip. Throws GameZipError for a zip that
 * is unsafe or unreadable. Nothing is run; nothing is written anywhere.
 */
export function inspectGameZip(buffer: Buffer): GameFile[] | null {
  let entries = 0;
  let total = 0;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(new Uint8Array(buffer), {
      filter(f) {
        if (f.name.endsWith("/")) return false;
        entries++;
        if (entries > MAX_ENTRIES) throw new GameZipError("too-many-files", "The zip has too many files.");
        if (f.originalSize > GAME_MAX_BYTES) throw new GameZipError("too-big", "A file inside the zip is too big.");
        total += f.originalSize;
        if (total > MAX_UNPACKED_BYTES) throw new GameZipError("too-big", "The unpacked game is too big.");
        return true;
      },
    });
  } catch (err) {
    if (err instanceof GameZipError) throw err;
    throw new GameZipError("bad-zip", "That zip could not be read.");
  }

  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(raw)) {
    const p = cleanPath(name);
    if (p === null) continue;
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    if (BLOCKED.has(ext)) throw new GameZipError("blocked-type", `Programs of this kind cannot be hosted: ${p.slice(0, 60)}`);
    files.set(p, data);
  }

  let prefix = "";
  if (!files.has("index.html")) {
    // Everything inside one wrapping folder is a common way to zip.
    const tops = new Set([...files.keys()].map((k) => k.split("/")[0]));
    const only = tops.size === 1 ? [...tops][0] : null;
    if (only && files.has(`${only}/index.html`)) prefix = `${only}/`;
    else return null;
  }
  const out: GameFile[] = [];
  for (const [p, data] of files) {
    if (!p.startsWith(prefix)) continue;
    const path = p.slice(prefix.length);
    out.push({ path, data, mime: mimeFor(path) });
  }
  return out;
}
