import { NextResponse } from "next/server";
import { runBuzzora } from "@/lib/buzzora/collect";
import { isCronRequest } from "@/lib/server-secrets";

export const runtime = "nodejs";
export const maxDuration = 600;

// The daily Buzzora job (called by the timer with the CRON_SECRET, like the other cron routes).
// Add ?dry=1 to see what it WOULD post without saving anything. ?days=30 looks further back (for a first fill of the board).
export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = new URL(request.url).searchParams;
  try {
    const report = await runBuzzora({ dry: q.get("dry") === "1", maxPosts: q.get("max") ? Number(q.get("max")) : undefined, gdeltQueries: q.get("gdelt") ? Number(q.get("gdelt")) : undefined, days: q.get("days") ? Number(q.get("days")) : undefined });
    return NextResponse.json(report);
  } catch (err) {
    console.error("buzzora job failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The Buzzora job failed." }, { status: 500 });
  }
}
