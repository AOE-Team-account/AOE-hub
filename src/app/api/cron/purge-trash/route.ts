import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { deleteFile, type StorageBackend } from "@/lib/storage/router";

export const runtime = "nodejs";

// Erases for good whatever has sat in the trash, or in a deleted account, for
// more than 30 days (decided by Clara, 2026-10-11): first the stored files,
// then the database rows. Not wired to a scheduler yet (Phase 7, with the
// other cron routes); safe to call by hand with the CRON_SECRET bearer token.
const RETENTION_DAYS = 30;

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: files, error: listError } = await supabase.rpc("list_expired_storage", { p_days: RETENTION_DAYS });
  if (listError) {
    console.error("purge-trash: listing files failed:", listError.message);
    return NextResponse.json({ error: "Could not list expired files." }, { status: 500 });
  }

  // Delete the stored bytes first. If any fails we stop before touching the
  // database, so a retry still knows which files to remove.
  let removedFiles = 0;
  for (const f of (files ?? []) as { asset_id: string; storage_backend: StorageBackend; storage_path: string }[]) {
    try {
      await deleteFile(f.storage_backend, f.storage_path);
      removedFiles += 1;
    } catch (err) {
      console.error(`purge-trash: could not delete ${f.storage_backend}:${f.storage_path}:`, err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Could not delete a stored file; nothing else was erased.", removedFiles }, { status: 500 });
    }
  }

  const { data, error } = await supabase.rpc("purge_expired", { p_days: RETENTION_DAYS });
  if (error) {
    console.error("purge-trash: purge failed:", error.message);
    return NextResponse.json({ error: "Purge failed.", removedFiles }, { status: 500 });
  }
  return NextResponse.json({ removedFiles, ...(data as object) });
}
