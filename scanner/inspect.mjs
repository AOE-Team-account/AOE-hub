// Our own checks that do not depend on knowing a virus in advance (so they can catch
// something brand new): what a file REALLY is, what is inside an archive, and whether a
// PDF tries to run something when it is opened. They run before and during the ClamAV scan.

// Programs and scripts are never accepted as downloads, even hidden inside another file.
export const BLOCKED_INNER = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "jse", "vbs", "vbe", "wsf", "wsh", "ps1", "psm1",
  "jar", "apk", "dmg", "pkg", "sh", "lnk", "reg", "hta", "cpl", "dll", "sys", "scf", "inf", "msp", "gadget", "class", "dex", "so", "dylib", "elf", "bin.exe",
]);
const PROGRAM_EXT = new Set(["exe", "dll", "sys", "scr", "com", "msi", "so", "dylib", "elf", "class", "dex", "bin", "o", "a"]);

export const extOf = (name) => { const m = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,10})$/); return m ? m[1] : ""; };

/** What the first bytes say the file is. */
export function sniff(head) {
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) return "pe"; // MZ: Windows program
  if (head.length >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return "elf";
  if (head.length >= 4) {
    const m = head.readUInt32BE(0);
    if (m === 0xfeedface || m === 0xfeedfacf || m === 0xcefaedfe || m === 0xcffaedfe || m === 0xcafebabe || m === 0xbebafeca) return "macho-or-java";
  }
  if (head.length >= 4 && head.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  const first = head.subarray(0, 1024).toString("latin1");
  if (first.includes("%PDF-")) return "pdf";
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5)) return "zip";
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "ole";
  if (head.length >= 2 && head[0] === 0x23 && head[1] === 0x21) return "script";
  return null;
}

/** A program wearing another file's name (a .exe renamed .pdf, .jpg, .docx...). */
export function disguisedProgram(name, kind) {
  const ext = extOf(name);
  if (kind === "pe" || kind === "elf" || kind === "macho-or-java") return PROGRAM_EXT.has(ext) ? null : "AOEhub.Heuristic.DisguisedProgram";
  if (kind === "script") {
    // A text file may start with "#!"; only treat it as a disguise when it claims to be a picture, document, sound or video.
    return ["pdf", "jpg", "jpeg", "png", "gif", "webp", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "mp3", "mp4", "wav", "epub"].includes(ext) ? "AOEhub.Heuristic.DisguisedScript" : null;
  }
  return null;
}

// ---- zip files (also .docx .xlsx .pptx .epub): read only the list of what is inside ----
function findEocd(tail) {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * Looks at the table of contents of a zip without unpacking it.
 * readRange(start, endInclusive) returns a Buffer. Returns { flagged?, signature?, skipped?, entries }.
 */
export async function inspectZip(size, readRange, { allowScripts }) {
  if (size < 22) return { skipped: true };
  const tailLen = Math.min(size, 65557);
  const tail = await readRange(size - tailLen, size - 1);
  const e = findEocd(tail);
  if (e < 0) return { skipped: true };
  let count = tail.readUInt16LE(e + 10);
  const cdSize = tail.readUInt32LE(e + 12);
  const cdOffset = tail.readUInt32LE(e + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return { skipped: true, why: "zip64" };
  if (cdSize > 48 * 1024 * 1024 || cdOffset + cdSize > size) return { skipped: true, why: "odd directory" };
  if (count > 10000) return { flagged: true, signature: "AOEhub.Heuristic.Zip.TooManyFiles" };
  const cd = cdSize > 0 ? await readRange(cdOffset, cdOffset + cdSize - 1) : Buffer.alloc(0);
  let p = 0;
  let totalUncompressed = 0;
  let totalCompressed = 0;
  let n = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50 && n < count) {
    const comp = cd.readUInt32LE(p + 20);
    const uncomp = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const name = cd.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    totalCompressed += comp;
    totalUncompressed += uncomp;
    const lower = name.toLowerCase();
    const base = lower.split("/").pop() || "";
    const ext = extOf(base);
    if (/(^|\/)\.\.(\/|$)/.test(name.replace(/\\/g, "/")) || /^([a-z]:)?[\\/]/i.test(name)) return { flagged: true, signature: "AOEhub.Heuristic.Zip.PathTraversal" };
    if (base === "vbaproject.bin" || base.endsWith(".vba")) return { flagged: true, signature: "AOEhub.Heuristic.Office.Macro" };
    if (BLOCKED_INNER.has(ext)) return { flagged: true, signature: `AOEhub.Heuristic.Zip.ContainsProgram.${ext}` };
    if (ext === "js" && !allowScripts) return { flagged: true, signature: "AOEhub.Heuristic.Zip.ContainsScript.js" };
    p += 46 + nameLen + extraLen + commentLen;
    n++;
  }
  // A small file that unpacks to something enormous (a "zip bomb").
  if (totalUncompressed > 1.5 * 1024 * 1024 * 1024 && totalUncompressed > totalCompressed * 120) return { flagged: true, signature: "AOEhub.Heuristic.Zip.Bomb" };
  if (totalUncompressed > 6 * 1024 * 1024 * 1024) return { flagged: true, signature: "AOEhub.Heuristic.Zip.Bomb" };
  return { entries: n };
}

// ---- PDFs: does it try to run something by itself? ----
const PDF_TOKENS = [
  { key: "launch", re: /\/Launch\b/ },
  { key: "javascript", re: /\/(JavaScript|JS)\b/ },
  { key: "openaction", re: /\/OpenAction\b/ },
];

/** Wraps a stream of Buffers, passing every chunk on unchanged while noticing PDF auto-run markers. */
export function pdfTap(stream, found) {
  let carry = "";
  return (async function* () {
    for await (const chunk of stream) {
      const text = carry + chunk.toString("latin1");
      for (const t of PDF_TOKENS) if (!found[t.key] && t.re.test(text)) found[t.key] = true;
      carry = text.slice(-16);
      yield chunk;
    }
  })();
}

export function pdfVerdict(found) {
  if (found.launch) return "AOEhub.Heuristic.PDF.LaunchAction";
  if (found.javascript && found.openaction) return "AOEhub.Heuristic.PDF.AutoRunScript";
  return null;
}
