import { NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { runRescan } from "@/lib/scanner/run";
import { isCronRequest } from "@/lib/server-secrets";

export const runtime = "nodejs";
export const maxDuration = 300;

// Run once a day by the scheduled-jobs workflow (Authorization: Bearer CRON_SECRET).
// Each run re-checks the stored files that have gone longest (and at least a week)
// without a check, up to a small amount per run so the cost stays tiny and steady.
const MAX_FILES_PER_RUN = 25;
const MAX_BYTES_PER_RUN = 6 * 1024 * 1024 * 1024;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServiceRoleClient();
  const before = new Date(Date.now() - WEEK_MS).toISOString();
  const { data } = await db
    .from("file_assets")
    .select("id, size_bytes, rescanned_at, scan_finished_at")
    .eq("scan_status", "clean")
    .eq("is_link", false)
    .not("storage_path", "is", null)
    .or(`rescanned_at.is.null,rescanned_at.lt.${before}`)
    .order("rescanned_at", { ascending: true, nullsFirst: true })
    .limit(200);
  const due = ((data ?? []) as { id: string; size_bytes: number | null; rescanned_at: string | null; scan_finished_at: string | null }[])
    // A file scanned less than a week ago does not need another look yet.
    .filter((a) => !a.rescanned_at && a.scan_finished_at ? a.scan_finished_at < before : true);
  const batch: string[] = [];
  let bytes = 0;
  for (const a of due) {
    if (batch.length >= MAX_FILES_PER_RUN || bytes + Number(a.size_bytes ?? 0) > MAX_BYTES_PER_RUN) break;
    batch.push(a.id);
    bytes += Number(a.size_bytes ?? 0);
  }
  after(async () => {
    for (const id of batch) await runRescan(id).catch((e) => console.error("Re-check failed to run:", e instanceof Error ? e.message : e));
  });
  return NextResponse.json({ due: due.length, started: batch.length, bytes });
}
