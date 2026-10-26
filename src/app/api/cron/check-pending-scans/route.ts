import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { deleteStaged } from "@/lib/storage/staging";
import { runScan, runPreviewScan } from "@/lib/scanner/run";

export const runtime = "nodejs";
export const maxDuration = 300;

// Safety net for the virus scanner, run every few minutes by the scheduled-jobs
// workflow (protected by CRON_SECRET: `Authorization: Bearer <secret>`):
//  - files whose scan never finished (the hub restarted, the scanner was down) are sent again;
//  - uploads that were started but never completed (closed tab) are cleaned up after a day.
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServiceRoleClient();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Pending files that nobody is scanning right now.
  const { data: pending } = await db
    .from("file_assets")
    .select("id, created_at, scan_started_at")
    .eq("scan_status", "pending")
    .or(`scan_started_at.is.null,scan_started_at.lt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`)
    .limit(20);
  const retried: string[] = [];
  for (const a of (pending ?? []) as { id: string; created_at: string }[]) {
    if (a.created_at > tenMinutesAgo) continue; // just uploaded: its own scan is about to start
    await runScan(a.id).catch((e) => console.error("Scan retry failed:", e instanceof Error ? e.message : e));
    retried.push(a.id);
  }

  // 2. Preview videos in the same state.
  const { data: previews } = await db.from("post_media").select("id, created_at").eq("scan_status", "pending").limit(20);
  for (const p of (previews ?? []) as { id: string; created_at: string }[]) {
    if (p.created_at > tenMinutesAgo) continue;
    await runPreviewScan(p.id).catch((e) => console.error("Preview scan retry failed:", e instanceof Error ? e.message : e));
    retried.push(p.id);
  }

  // 3. Uploads that were never finished.
  const { data: stale } = await db
    .from("file_assets")
    .select("id, staging_key")
    .eq("scan_status", "uploading")
    .lt("created_at", dayAgo)
    .limit(50);
  for (const a of (stale ?? []) as { id: string; staging_key: string | null }[]) {
    if (a.staging_key) await deleteStaged(a.staging_key);
    await db.from("file_assets").update({ scan_status: "error", scan_finished_at: new Date().toISOString() }).eq("id", a.id);
  }

  return NextResponse.json({ retried: retried.length, abandoned: (stale ?? []).length });
}
