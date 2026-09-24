import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/ai/server/admin-guard";
import { AINotConfiguredError } from "@/lib/ai/server/config";
import { DocumentExtractError, extractEpubText, extractPdfText } from "@/lib/ai/server/document-extract";
import { addPhilosophyText, deletePhilosophyBook, getIndexStatus, listPhilosophyBooks } from "@/lib/ai/server/indexer";

export const runtime = "nodejs";

// Admin-only upload, not the public File Board upload, so a more generous
// cap than a plain-text book would need is fine — real PDF/EPUB books run
// larger than their extractable text for the same content (fonts, images,
// formatting). Real project philosophy books ran up to ~45MB with genuine
// page images alongside real text. A true outlier past this (one project
// book hit 400MB) is better added directly via a one-off script than by
// raising this system-wide limit for a live server on the strength of one
// file.
const MAX_BOOK_BYTES = 60 * 1024 * 1024;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    const [status, books] = await Promise.all([getIndexStatus(), listPhilosophyBooks()]);
    return NextResponse.json({ ...status, books });
  } catch (err) {
    if (err instanceof AINotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: "Could not read the knowledge base." }, { status: 500 });
  }
}

// Deletes one philosophy book by id (never any other kb_documents source —
// file/experience posts are removed by deleting the post itself, and admin
// answers are removed via retract, both elsewhere).
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing book id." }, { status: 400 });
  try {
    await deletePhilosophyBook(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to delete book ${id}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not delete the book." }, { status: 500 });
  }
}

// Adds a philosophy book from an uploaded .txt/.md/.pdf/.epub file, or
// pasted text. It is only stored here; embedding happens in the index step
// so a large book never has to finish inside a single request.
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const form = await request.formData();
  const title = form.get("title")?.toString().trim();
  const pasted = form.get("text")?.toString();
  const file = form.get("file");
  if (!title || title.length > 200) return NextResponse.json({ error: "Give the book a title (up to 200 characters)." }, { status: 400 });

  let text = pasted ?? "";
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BOOK_BYTES) {
      return NextResponse.json({ error: `That file is over ${MAX_BOOK_BYTES / (1024 * 1024)} MB.` }, { status: 413 });
    }
    const ext = file.name.toLowerCase().match(/\.(txt|md|markdown|pdf|epub)$/)?.[1];
    if (!ext) {
      return NextResponse.json({ error: "Only .txt, .md, .pdf, and .epub files are supported — or paste the text directly." }, { status: 400 });
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = ext === "pdf" ? await extractPdfText(buffer) : ext === "epub" ? await extractEpubText(buffer) : buffer.toString("utf-8");
    } catch (err) {
      if (err instanceof DocumentExtractError) return NextResponse.json({ error: err.message }, { status: 400 });
      console.error(`Failed to extract text from ${file.name}:`, err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Could not read that file." }, { status: 400 });
    }
  }
  text = text.trim();
  if (text.length < 50) {
    return NextResponse.json(
      { error: "There isn't enough text to add — for a PDF, this can also mean it's scanned images with no selectable text." },
      { status: 400 }
    );
  }

  try {
    await addPhilosophyText(title, text);
    return NextResponse.json({ ok: true, characters: text.length });
  } catch (err) {
    console.error(`Failed to save book "${title}":`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not save the book." }, { status: 500 });
  }
}
