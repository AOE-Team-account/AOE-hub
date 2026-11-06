import { NextResponse } from "next/server";
import { runVideoPicks } from "@/lib/buzzora/video-picks";

export const runtime = "nodejs";
export const maxDuration = 120;

// The daily "Videos" job (CRON_SECRET, like the other cron routes). ?dry=1 shows what it WOULD post.
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await runVideoPicks({ dry: q.get("dry") === "1", maxPosts: q.get("max") ? Number(q.get("max")) : undefined }));
  } catch (err) {
    console.error("video picks job failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The video picks job failed." }, { status: 500 });
  }
}
