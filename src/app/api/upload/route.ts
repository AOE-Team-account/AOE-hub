import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scanFileWithShortPoll, type ScanResult } from "@/lib/malware-scan/virustotal";
import { chooseStorageBackend, uploadFile, deleteFile } from "@/lib/storage/router";
import type { MediaType } from "@/lib/types";

// Node runtime (not edge) — needed for Buffer and for VirusTotal's polling
// loop, which can legitimately take several seconds per file.
export const runtime = "nodejs";

// A pragmatic safety cap so this route never tries to buffer an enormous
// file entirely into memory. Files this big are rare for a homeschool
// resource hub; supporting them properly would mean a presigned
// direct-to-storage upload instead of routing bytes through this server —
// a reasonable future refinement, not built here.
const MAX_UPLOAD_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

interface UploadResult {
  label: string;
  scanStatus: ScanResult;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to upload." }, { status: 401 });
  }

  const form = await request.formData();
  const title = form.get("title")?.toString().trim();
  const description = form.get("description")?.toString().trim();
  const section = form.get("section")?.toString();
  const mediaType = form.get("mediaType")?.toString();
  const authorship = form.get("authorship")?.toString();
  const remixOfPostId = form.get("remixOfPostId")?.toString() || null;
  const labels = JSON.parse(form.get("labels")?.toString() || "[]") as string[];
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (!title || !description || !section || !mediaType || !authorship || files.length === 0) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  for (const file of files) {
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json(
        { error: `"${file.name}" is too large (max ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB per file for now).` },
        { status: 413 }
      );
    }
  }

  const { data: post, error: postError } = await supabase
    .from("file_posts")
    .insert({
      author_id: user.id,
      title,
      description,
      section,
      media_type: mediaType,
      authorship,
      remix_of_post_id: remixOfPostId,
    })
    .select()
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: postError?.message ?? "Could not create the post." }, { status: 500 });
  }

  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const label = labels[i] || file.name;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const backend = chooseStorageBackend(buffer.length, mediaType as MediaType);
    const key = `${post.id}/${randomUUID()}-${file.name}`;

    // Upload first, regardless of scan outcome — the file needs to exist
    // somewhere for a *later* scan check to confirm it either way (see
    // /api/cron/check-pending-scans). RLS keeps non-"clean" file_assets
    // rows hidden from everyone but the uploader/admins, and the download
    // route independently refuses anything that isn't "clean", so sitting
    // in storage pre-verification is safe — it's just not reachable yet.
    try {
      await uploadFile(backend, key, buffer, contentType);
    } catch (err) {
      console.error(`Storage upload failed for ${file.name}:`, err);
      results.push({ label, scanStatus: "pending" });
      continue; // don't record an asset row for a file that never made it to storage
    }

    let scanStatus: ScanResult = "pending";
    let analysisId: string | null = null;
    try {
      const scan = await scanFileWithShortPoll(buffer, file.name);
      scanStatus = scan.result;
      analysisId = scan.analysisId;
    } catch (err) {
      console.error("VirusTotal scan failed:", err);
      // Stays "pending" with no analysis id — the cron job can't resolve
      // this one since VT never even accepted it; worth a manual look.
    }

    if (scanStatus === "flagged") {
      // Confirmed malicious already (fast scan) — quarantine for real by
      // deleting the bytes immediately rather than leaving them in storage.
      try {
        await deleteFile(backend, key);
      } catch (err) {
        console.error(`Failed to delete flagged file ${file.name}:`, err);
      }
    }

    const { error: assetError } = await supabase.from("file_assets").insert({
      file_post_id: post.id,
      label,
      storage_path: scanStatus === "flagged" ? null : key,
      storage_backend: scanStatus === "flagged" ? null : backend,
      mime_type: contentType,
      size_bytes: buffer.length,
      scan_status: scanStatus,
      scan_analysis_id: scanStatus === "pending" ? analysisId : null,
    });

    if (assetError) console.error("Failed to record file asset:", assetError);
    results.push({ label, scanStatus });
  }

  return NextResponse.json({ postId: post.id, results });
}
