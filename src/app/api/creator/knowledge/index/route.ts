import { NextResponse } from "next/server";
import { requireCreator } from "@/lib/ai/server/creator-guard";
import { AIProviderError } from "@/lib/ai/server/chat-providers";
import { AINotConfiguredError } from "@/lib/ai/server/config";
import { runIndexing } from "@/lib/ai/server/indexer";

export const runtime = "nodejs";

// One time-boxed slice of indexing. The Creator panel calls this repeatedly
// until `done` is true, so no single request has to embed a whole book.
export async function POST() {
  const guard = await requireCreator();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await runIndexing(40_000));
  } catch (err) {
    if (err instanceof AINotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    if (err instanceof AIProviderError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("Indexing failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Indexing failed." }, { status: 500 });
  }
}
