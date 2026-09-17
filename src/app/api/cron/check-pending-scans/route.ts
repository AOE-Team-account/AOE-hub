import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { checkAnalysis } from "@/lib/malware-scan/virustotal";
import { deleteFile, type StorageBackend } from "@/lib/storage/router";

export const runtime = "nodejs";

// Resolves file_assets stuck at scan_status="pending" — the case where
// /api/upload's short poll gave up before VirusTotal finished (observed
// directly during Phase 3 testing: their free tier can leave a scan
// "queued" for well over a minute). Not wired to an actual scheduler yet —
// that's a Phase 4 hosting concern (Vercel Cron / Cloudflare Cron Triggers
// / a GitHub Action on a timer all work). Safe to call by hand or on any
// schedule in the meantime; each run only touches assets still pending.
//
// Protected by a shared secret so this can't be triggered by anyone who
// finds the URL — set CRON_SECRET in the environment and pass it as
// `Authorization: Bearer <secret>`.
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: pending, error } = await supabase
    .from("file_assets")
    .select("id, storage_path, storage_backend, scan_analysis_id")
    .eq("scan_status", "pending")
    .not("scan_analysis_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resolved: { id: string; result: string }[] = [];

  for (const asset of pending ?? []) {
    const result = await checkAnalysis(asset.scan_analysis_id as string);
    if (result === "pending") continue; // still not ready, leave for next run

    if (result === "flagged") {
      if (asset.storage_backend && asset.storage_path) {
        try {
          await deleteFile(asset.storage_backend as StorageBackend, asset.storage_path);
        } catch (err) {
          console.error(`Failed to quarantine flagged asset ${asset.id}:`, err);
        }
      }
      await supabase
        .from("file_assets")
        .update({ scan_status: "flagged", storage_path: null, storage_backend: null, scan_analysis_id: null })
        .eq("id", asset.id);
    } else {
      await supabase.from("file_assets").update({ scan_status: "clean", scan_analysis_id: null }).eq("id", asset.id);
    }
    resolved.push({ id: asset.id, result });
  }

  return NextResponse.json({ checked: pending?.length ?? 0, resolved });
}
