import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { uploadFile, deleteFile } from "@/lib/storage/router";
import { scanFileWithShortPoll } from "@/lib/malware-scan/virustotal";
import { MEDIA_LIMITS } from "@/lib/media";

export const runtime = "nodejs";

// One optional preview (a picture or a short video) for a post the caller owns.
// Pictures are decoded and written out again as WebP at a sensible size, so
// only picture data survives (no hidden code, no camera location). Videos
// are checked by the malware scanner and stay hidden until it says they are clean.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeVideo(buf: Buffer): "mp4" | "webm" | null {
  if (buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") return "mp4";
  if (buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const form = await request.formData();
  const ownerType = form.get("ownerType")?.toString();
  const ownerId = form.get("ownerId")?.toString() ?? "";
  const file = form.get("file");
  if ((ownerType !== "file" && ownerType !== "experience") || !UUID.test(ownerId) || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  // The post must be the caller's own.
  const table = ownerType === "file" ? "file_posts" : "experience_posts";
  const { data: post } = await supabase.from(table).select("id").eq("id", ownerId).eq("author_id", user.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "That post is not yours." }, { status: 403 });

  const svc = createServiceRoleClient();
  const { data: existing } = await svc.from("post_media").select("kind").eq("owner_type", ownerType).eq("owner_id", ownerId);
  const images = (existing ?? []).filter((m) => m.kind === "image").length;
  const videos = (existing ?? []).filter((m) => m.kind === "video").length;

  const buffer = Buffer.from(await file.arrayBuffer());
  const video = looksLikeVideo(buffer);
  const isVideo = video !== null;

  if (isVideo) {
    if (ownerType !== "file") return NextResponse.json({ error: "A post can have a picture only.", code: "no-video" }, { status: 400 });
    if (buffer.length > MEDIA_LIMITS.videoBytes) return NextResponse.json({ error: "That video is too big.", code: "video-too-big" }, { status: 413 });
    if (videos >= MEDIA_LIMITS.fileVideos) return NextResponse.json({ error: "Too many videos.", code: "too-many" }, { status: 400 });
  } else {
    if (buffer.length > MEDIA_LIMITS.imageInputBytes) return NextResponse.json({ error: "That picture is too big.", code: "image-too-big" }, { status: 413 });
    const max = ownerType === "file" ? MEDIA_LIMITS.fileImages : MEDIA_LIMITS.experienceImages;
    if (images >= max) return NextResponse.json({ error: "Too many pictures.", code: "too-many" }, { status: 400 });
  }

  const allowance = await svc.rpc("take_upload_allowance", { p_user: user.id, p_files: 1, p_bytes: buffer.length });
  const allow = allowance.data as { ok: boolean; files_left: number | null; bytes_left: number | null } | null;
  if (allowance.error || !allow) return NextResponse.json({ error: "Could not check your upload allowance." }, { status: 500 });
  if (!allow.ok) return NextResponse.json({ error: "Daily upload limit reached.", code: "daily-limit", filesLeft: allow.files_left, bytesLeft: allow.bytes_left }, { status: 429 });
  const refund = () => svc.rpc("refund_upload_allowance", { p_user: user.id, p_files: 1, p_bytes: buffer.length });

  let outBuffer: Buffer;
  let mime: string;
  let ext: string;
  if (isVideo) {
    outBuffer = buffer;
    mime = video === "mp4" ? "video/mp4" : "video/webm";
    ext = video;
  } else {
    try {
      outBuffer = await sharp(buffer, { failOn: "error" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      await refund();
      return NextResponse.json({ error: "That does not look like a picture.", code: "not-image" }, { status: 400 });
    }
    mime = "image/webp";
    ext = "webp";
  }

  const key = `previews/${ownerType}/${ownerId}/${randomUUID()}.${ext}`;
  try {
    await uploadFile("r2", key, outBuffer, mime);
  } catch (err) {
    console.error("Preview upload failed:", err instanceof Error ? err.message : err);
    await refund();
    return NextResponse.json({ error: "Could not store the preview." }, { status: 500 });
  }

  let scanStatus: "clean" | "flagged" | "pending" = "clean";
  let analysisId: string | null = null;
  if (isVideo) {
    scanStatus = "pending";
    try {
      const scan = await scanFileWithShortPoll(outBuffer, `preview.${ext}`);
      scanStatus = scan.result;
      analysisId = scan.analysisId;
    } catch (err) {
      console.error("Preview scan failed:", err instanceof Error ? err.message : err);
    }
    if (scanStatus === "flagged") {
      try { await deleteFile("r2", key); } catch (err) { console.error("Could not delete flagged preview:", err); }
    }
  }

  const { data: row, error } = await svc.from("post_media").insert({
    owner_type: ownerType,
    owner_id: ownerId,
    kind: isVideo ? "video" : "image",
    storage_backend: "r2",
    storage_path: scanStatus === "flagged" ? null : key,
    mime_type: mime,
    size_bytes: outBuffer.length,
    scan_status: scanStatus,
    scan_analysis_id: scanStatus === "pending" ? analysisId : null,
    sort_order: images + videos,
  }).select("id").single();
  if (error || !row) {
    console.error("Could not record preview:", error?.message);
    try { await deleteFile("r2", key); } catch { /* nothing more to do */ }
    await refund();
    return NextResponse.json({ error: "Could not save the preview." }, { status: 500 });
  }
  return NextResponse.json({ id: row.id, kind: isVideo ? "video" : "image", scanStatus });
}
