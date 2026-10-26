import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { deleteStaged } from "@/lib/storage/staging";
import { deleteFromR2Prefix } from "@/lib/storage/r2";
import { CONTACT_EMAIL } from "@/lib/site";
import { scanStagedFile } from "./client";

// Runs the scan of one uploaded file and records the result. Safe to call more
// than once for the same file: only one call at a time can take it.

const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = [30_000, 90_000];
// Problems retrying cannot fix.
const FINAL_CODES = new Set(["missing", "size-mismatch", "too-big", "bad-request", "not-configured"]);

const contact = CONTACT_EMAIL ?? "info@aoe.name";

async function tell(userId: string, kind: "scan-flagged" | "scan-failed", body: string, data: Record<string, unknown>) {
  await createServiceRoleClient().from("notifications").insert({ user_id: userId, body, kind, data });
}

export async function runScan(assetId: string, attempt = 0): Promise<void> {
  const db = createServiceRoleClient();
  const { data: claimed, error } = await db.rpc("claim_scan", { p_asset: assetId });
  if (error) {
    console.error("Could not take the file for scanning:", error.message);
    return;
  }
  const asset = (claimed as { id: string; file_post_id: string; label: string; staging_key: string | null; final_key: string | null; final_backend: string | null; size_bytes: number | null; mime_type: string | null; scan_attempts: number; game_prefix: string | null }[] | null)?.[0];
  if (!asset) return; // not pending, or someone else is already scanning it

  const { data: post } = await db.from("file_posts").select("author_id").eq("id", asset.file_post_id).maybeSingle();
  const authorId = (post as { author_id: string } | null)?.author_id;

  const outcome =
    asset.staging_key && asset.final_key && asset.size_bytes
      ? await scanStagedFile({
          assetId: asset.id,
          stagingKey: asset.staging_key,
          size: Number(asset.size_bytes),
          contentType: asset.mime_type ?? "application/octet-stream",
          finalBackend: (asset.final_backend as "r2" | "internet-archive") ?? "r2",
          finalKey: asset.final_key,
        })
      : ({ status: "error", code: "bad-request", message: "The file record is incomplete." } as const);

  if (outcome.status === "clean") {
    await db
      .from("file_assets")
      .update({
        scan_status: "clean",
        storage_path: outcome.finalKey ?? asset.final_key,
        storage_backend: outcome.finalBackend ?? asset.final_backend ?? "r2",
        scan_signature: null,
        scan_finished_at: new Date().toISOString(),
      })
      .eq("id", asset.id);
    if (asset.staging_key) await deleteStaged(asset.staging_key);
    return;
  }

  const cleanUp = async () => {
    if (asset.staging_key) await deleteStaged(asset.staging_key);
    if (asset.game_prefix) await deleteFromR2Prefix(asset.game_prefix).catch(() => undefined);
  };

  if (outcome.status === "flagged") {
    await db
      .from("file_assets")
      .update({ scan_status: "flagged", storage_path: null, storage_backend: null, scan_signature: outcome.signature ?? null, scan_finished_at: new Date().toISOString(), is_game: false, game_prefix: null })
      .eq("id", asset.id);
    await cleanUp();
    if (authorId) {
      await tell(
        authorId,
        "scan-flagged",
        `A virus or something harmful was caught by our scanner in "${asset.label}". Please fix the file and upload it again, or contact us at ${contact}.`,
        { post_id: asset.file_post_id, asset_id: asset.id }
      );
    }
    return;
  }

  // The scanner could not finish.
  console.error(`Scan of ${asset.id} failed (attempt ${asset.scan_attempts}): ${outcome.code} ${outcome.message ?? ""}`);
  if (FINAL_CODES.has(outcome.code ?? "") || asset.scan_attempts >= MAX_ATTEMPTS) {
    await db
      .from("file_assets")
      .update({ scan_status: "error", storage_path: null, storage_backend: null, scan_finished_at: new Date().toISOString(), is_game: false, game_prefix: null })
      .eq("id", asset.id);
    await cleanUp();
    // The upload did not work, so it does not count against today's allowance.
    if (authorId) {
      await db.rpc("refund_upload_allowance", { p_user: authorId, p_files: 1, p_bytes: Number(asset.size_bytes ?? 0) });
      await tell(
        authorId,
        "scan-failed",
        `Your file "${asset.label}" failed to upload. Please upload it again now or after a few minutes. If you have any questions or problems, contact us at ${contact}.`,
        { post_id: asset.file_post_id, asset_id: asset.id }
      );
    }
    return;
  }

  // Let it be taken again: here after a short wait (if this process stays up), and by the scheduled job.
  await db.from("file_assets").update({ scan_started_at: null }).eq("id", asset.id);
  const wait = RETRY_AFTER_MS[Math.min(attempt, RETRY_AFTER_MS.length - 1)];
  setTimeout(() => {
    runScan(assetId, attempt + 1).catch((e) => console.error("Scan retry failed:", e instanceof Error ? e.message : e));
  }, wait);
}

/** The same for a preview video: clean -> shown; caught -> hidden for good; trouble -> tried again later, then dropped. */
export async function runPreviewScan(mediaId: string): Promise<void> {
  const db = createServiceRoleClient();
  const { data: row } = await db
    .from("post_media")
    .select("id, owner_type, owner_id, staging_key, final_key, size_bytes, mime_type, scan_status, scan_attempts, scan_started_at")
    .eq("id", mediaId)
    .maybeSingle();
  const m = row as { id: string; owner_type: string; owner_id: string; staging_key: string | null; final_key: string | null; size_bytes: number; mime_type: string; scan_status: string; scan_attempts: number; scan_started_at: string | null } | null;
  if (!m || m.scan_status !== "pending" || !m.staging_key || !m.final_key) return;
  if (m.scan_started_at && Date.now() - new Date(m.scan_started_at).getTime() < 30 * 60 * 1000) return;
  await db.from("post_media").update({ scan_started_at: new Date().toISOString(), scan_attempts: m.scan_attempts + 1 }).eq("id", m.id);

  const outcome = await scanStagedFile({ assetId: m.id, stagingKey: m.staging_key, size: Number(m.size_bytes), contentType: m.mime_type, finalBackend: "r2", finalKey: m.final_key });
  if (outcome.status === "clean") {
    await db.from("post_media").update({ scan_status: "clean", storage_path: m.final_key, storage_backend: "r2" }).eq("id", m.id);
    await deleteStaged(m.staging_key);
    return;
  }
  if (outcome.status === "flagged") {
    await db.from("post_media").update({ scan_status: "flagged", storage_path: null }).eq("id", m.id);
    await deleteStaged(m.staging_key);
    return;
  }
  if (m.scan_attempts + 1 >= MAX_ATTEMPTS || FINAL_CODES.has(outcome.code ?? "")) {
    await db.from("post_media").delete().eq("id", m.id);
    await deleteStaged(m.staging_key);
    return;
  }
  await db.from("post_media").update({ scan_started_at: null }).eq("id", m.id);
}
