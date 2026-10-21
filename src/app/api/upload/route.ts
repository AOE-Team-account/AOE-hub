import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendlyWriteError } from "@/lib/errors";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { scanFileWithShortPoll, type ScanResult } from "@/lib/malware-scan/virustotal";
import { chooseStorageBackend, uploadFile, deleteFile } from "@/lib/storage/router";
import type { MediaType } from "@/lib/types";
import { GAME_MAX_BYTES, GameZipError, inspectGameZip, type GameFile } from "@/lib/games";
import { uploadToR2 } from "@/lib/storage/r2";
import { deleteFromR2Prefix } from "@/lib/storage/r2";

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
  const madeWithAi = form.get("madeWithAi")?.toString() === "true";
  let rawLinks: { label?: unknown; url?: unknown }[] = [];
  try {
    const parsed = JSON.parse(form.get("links")?.toString() || "[]");
    if (Array.isArray(parsed)) rawLinks = parsed.slice(0, 20);
  } catch {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!title || !description || !section || !mediaType || !authorship || (files.length === 0 && rawLinks.length === 0)) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Link-outs: https only, no passwords in the address, and only websites the
  // Creator has approved (an address of the site itself or one of its sub-sites).
  const links: { label: string; url: string; host: string }[] = [];
  if (rawLinks.length > 0) {
    const { data: hostRows } = await createServiceRoleClient().from("approved_link_hosts").select("host").eq("active", true);
    const approved = ((hostRows ?? []) as { host: string }[]).map((h) => h.host);
    for (const l of rawLinks) {
      const label = typeof l.label === "string" ? l.label.trim().slice(0, 120) : "";
      let url: URL;
      try {
        url = new URL(typeof l.url === "string" ? l.url.trim() : "");
      } catch {
        return NextResponse.json({ error: "Invalid link.", code: "link-invalid" }, { status: 400 });
      }
      if (url.protocol !== "https:" || url.username || url.password || url.href.length > 500) {
        return NextResponse.json({ error: "Invalid link.", code: "link-invalid" }, { status: 400 });
      }
      const host = url.hostname.toLowerCase();
      if (!approved.some((a) => host === a || host.endsWith("." + a))) {
        return NextResponse.json({ error: "That website is not on the allowed list.", code: "link-host", host }, { status: 400 });
      }
      links.push({ label: label || host, url: url.href, host });
    }
  }

  for (const file of files) {
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json(
        { error: `"${file.name}" is too large (max ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB per file for now).` },
        { status: 413 }
      );
    }
  }

  // Games and apps: at most 50 MB each (bigger ones link out). A .zip with an
  // index.html at the top becomes a playable game; the zip is looked inside
  // (never run) before anything is stored, so an unsafe one is refused whole.
  const isGamePost = mediaType === "game" || mediaType === "app";
  const preBuffers: (Buffer | null)[] = files.map(() => null);
  const gamePlans: (GameFile[] | null)[] = files.map(() => null);
  if (isGamePost) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > GAME_MAX_BYTES) {
        return NextResponse.json({ error: "A game or app can be at most 50 MB here.", code: "game-too-big", name: files[i].name }, { status: 413 });
      }
      if (/\.zip$/i.test(files[i].name)) {
        preBuffers[i] = Buffer.from(await files[i].arrayBuffer());
        try {
          gamePlans[i] = inspectGameZip(preBuffers[i]!);
        } catch (err) {
          if (err instanceof GameZipError) return NextResponse.json({ error: err.message, code: "game-invalid", reason: err.code }, { status: 400 });
          throw err;
        }
      }
    }
  }

  // The daily allowance (set by the Creator; the Creator's own account has none).
  // Taken before anything is stored, and given back for files that fail.
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const allowance = await createServiceRoleClient().rpc("take_upload_allowance", { p_user: user.id, p_files: files.length + links.length, p_bytes: totalBytes });
  if (allowance.error) {
    console.error("Upload allowance check failed:", allowance.error.message);
    return NextResponse.json({ error: "Could not check your upload allowance. Please try again." }, { status: 500 });
  }
  const allow = allowance.data as { ok: boolean; files_left: number | null; bytes_left: number | null };
  if (!allow.ok) {
    return NextResponse.json(
      { error: "Daily upload limit reached.", code: "daily-limit", filesLeft: allow.files_left, bytesLeft: allow.bytes_left },
      { status: 429 }
    );
  }
  let refundFiles = 0;
  let refundBytes = 0;

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
      made_with_ai: madeWithAi,
    })
    .select()
    .single();

  if (postError || !post) {
    await createServiceRoleClient().rpc("refund_upload_allowance", { p_user: user.id, p_files: files.length + links.length, p_bytes: totalBytes });
    return NextResponse.json({ error: postError ? friendlyWriteError(postError) : "Could not create the post." }, { status: 500 });
  }

  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const label = labels[i] || file.name;
    const buffer = preBuffers[i] ?? Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const backend = chooseStorageBackend(buffer.length, mediaType as MediaType);
    const key = `${post.id}/${randomUUID()}-${file.name}`;

    // Upload first, regardless of scan outcome — the file needs to exist
    // somewhere for a *later* scan check to confirm it either way (see
    // /api/cron/check-pending-scans). RLS keeps non-"clean" file_assets
    // rows hidden from everyone but the uploader and reviewers, and the download
    // route independently refuses anything that isn't "clean", so sitting
    // in storage pre-verification is safe — it's just not reachable yet.
    try {
      await uploadFile(backend, key, buffer, contentType);
    } catch (err) {
      console.error(`Storage upload failed for ${file.name}:`, err);
      results.push({ label, scanStatus: "pending" });
      refundFiles++;
      refundBytes += buffer.length;
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

    // Written with the service role on purpose: scan_status is decided by this
    // server code, and members have no write access to file_assets at all (a
    // member must never be able to mark their own file "clean"). The post
    // above was just created under the member's own session, so it is theirs.
    const assetId = randomUUID();
    const { error: assetError } = await createServiceRoleClient().from("file_assets").insert({
      id: assetId,
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

    // A playable game: unpack it into storage so it can be served from the play address.
    const plan = gamePlans[i];
    if (plan && !assetError && scanStatus !== "flagged") {
      const prefix = `games/${assetId}/`;
      try {
        const queue = [...plan];
        await Promise.all(
          Array.from({ length: 6 }, async () => {
            for (let f = queue.shift(); f; f = queue.shift()) {
              await uploadToR2(prefix + f.path, Buffer.from(f.data), f.mime);
            }
          })
        );
        await createServiceRoleClient().from("file_assets").update({ is_game: true, game_prefix: prefix }).eq("id", assetId);
      } catch (err) {
        console.error("Could not unpack the game:", err instanceof Error ? err.message : err);
        try {
          await deleteFromR2Prefix(prefix);
        } catch {
          /* nothing more to do; the zip itself is still a normal download */
        }
      }
    }
    results.push({ label, scanStatus });
  }

  // Links have nothing to store or scan: record them as they are.
  for (const link of links) {
    const { error: linkError } = await createServiceRoleClient().from("file_assets").insert({
      file_post_id: post.id,
      label: link.label,
      is_link: true,
      link_url: link.url,
      link_host: link.host,
      scan_status: "clean",
    });
    if (linkError) {
      console.error("Failed to record link:", linkError);
      refundFiles++;
    } else {
      results.push({ label: link.label, scanStatus: "clean" });
    }
  }

  if (refundFiles > 0) {
    await createServiceRoleClient().rpc("refund_upload_allowance", { p_user: user.id, p_files: refundFiles, p_bytes: refundBytes });
  }
  return NextResponse.json({ postId: post.id, results });
}
