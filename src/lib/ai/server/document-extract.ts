import "server-only";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Plain-text extraction for uploaded philosophy books. Both libraries here
// are pure JS with no native/compiled dependencies — deliberate, since this
// needs to keep working on Namecheap/cPanel shared hosting later (Phase 7),
// where installing a system binary or a native Node addon isn't an option.
// pdfjs-dist's optional @napi-rs/canvas dependency is only needed for
// rendering pages to images; getTextContent() never touches it.

export class DocumentExtractError extends Error {}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdf.js's Node fallback still dynamically imports its worker script from
  // GlobalWorkerOptions.workerSrc, defaulting to the relative path
  // "./pdf.worker.mjs" — meaningless once Next's bundler has moved this
  // code into .next/server/chunks/. Point it at the real file on disk
  // instead of the bundle-relative guess.
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  try {
    const doc = await loadingTask.promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join("\n\n").trim();
  } catch (err) {
    if (err instanceof DocumentExtractError) throw err;
    throw new DocumentExtractError(`Could not read that PDF: ${err instanceof Error ? err.message : "unknown error"}`);
  } finally {
    await loadingTask.destroy();
  }
}

// A minimal EPUB reader: unzip, follow container.xml -> the OPF manifest ->
// the spine's reading order, then strip HTML tags from each chapter. Good
// enough for extracting readable text (all this feature needs) without a
// full EPUB library dependency — EPUB's container/OPF format is a stable,
// well-documented structure, not something that needs a heavy parser to
// read reliably.
function stripHtmlTags(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractEpubText(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new DocumentExtractError(`Could not read that EPUB: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new DocumentExtractError("That EPUB is missing META-INF/container.xml — it may not be a valid EPUB file.");
  const containerXml = await containerFile.async("string");
  const opfPath = containerXml.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new DocumentExtractError("Could not find the EPUB's content file (no rootfile in container.xml).");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new DocumentExtractError(`The EPUB's container.xml points to "${opfPath}", but that file isn't in the archive.`);
  const opfXml = await opfFile.async("string");

  // <item> attributes can appear in either order, so match both.
  const manifest: Record<string, string> = {};
  for (const m of opfXml.matchAll(/<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"[^>]*\/?>/g)) manifest[m[1]] = m[2];
  for (const m of opfXml.matchAll(/<item\b[^>]*\bhref="([^"]+)"[^>]*\bid="([^"]+)"[^>]*\/?>/g)) manifest[m[2]] ??= m[1];

  const spineIds = [...opfXml.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)].map((m) => m[1]);
  if (spineIds.length === 0) throw new DocumentExtractError("This EPUB's spine lists no chapters to read.");

  const chapters: string[] = [];
  for (const id of spineIds) {
    const href = manifest[id];
    if (!href) continue;
    const file = zip.file(opfDir + href);
    if (!file) continue;
    const html = await file.async("string");
    chapters.push(stripHtmlTags(html));
  }
  return chapters.join("\n\n").trim();
}
