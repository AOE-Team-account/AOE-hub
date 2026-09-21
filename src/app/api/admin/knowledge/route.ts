import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/ai/server/admin-guard";
import { AINotConfiguredError } from "@/lib/ai/server/config";
import { addPhilosophyText, getIndexStatus } from "@/lib/ai/server/indexer";

export const runtime = "nodejs";

const MAX_BOOK_BYTES = 8 * 1024 * 1024;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await getIndexStatus());
  } catch (err) {
    if (err instanceof AINotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: "Could not read the knowledge base." }, { status: 500 });
  }
}

// Adds a philosophy book from an uploaded .txt/.md file or pasted text. It is
// only stored here; embedding happens in the index step so a large book never
// has to finish inside a single request.
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
    if (file.size > MAX_BOOK_BYTES) return NextResponse.json({ error: "That file is over 8 MB." }, { status: 413 });
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      return NextResponse.json({ error: "Only .txt and .md files are supported for now — paste the text for other formats." }, { status: 400 });
    }
    text = await file.text();
  }
  text = text.trim();
  if (text.length < 50) return NextResponse.json({ error: "There isn't enough text to add." }, { status: 400 });

  try {
    await addPhilosophyText(title, text);
    return NextResponse.json({ ok: true, characters: text.length });
  } catch {
    return NextResponse.json({ error: "Could not save the book." }, { status: 500 });
  }
}
