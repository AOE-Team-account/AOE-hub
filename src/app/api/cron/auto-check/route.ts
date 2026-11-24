import { NextResponse } from "next/server";
import { runAutoCheck } from "@/lib/moderation/auto-check";
import { isCronRequest } from "@/lib/server-secrets";

export const runtime = "nodejs";
export const maxDuration = 600;

// The daily automatic policy check (CRON_SECRET, like the other cron routes). ?dry=1 shows what it WOULD report.
export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await runAutoCheck({ dry: q.get("dry") === "1", max: q.get("max") ? Number(q.get("max")) : undefined }));
  } catch (err) {
    console.error("auto-check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The automatic check failed." }, { status: 500 });
  }
}
