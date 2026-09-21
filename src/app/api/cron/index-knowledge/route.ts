import { NextResponse } from "next/server";
import { runIndexing } from "@/lib/ai/server/indexer";

export const runtime = "nodejs";

// Keeps the AI's knowledge base current: picks up new/edited/removed posts
// and embeds anything unfinished. Same protection as the scan cron — a
// shared secret in `Authorization: Bearer <CRON_SECRET>`. NOT yet attached
// to a scheduler (Phase 7, alongside check-pending-scans); until then the
// admin dashboard's "Update index" button does the same work by hand.
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runIndexing(50_000));
  } catch (err) {
    console.error("Cron indexing failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Indexing failed." }, { status: 500 });
  }
}
