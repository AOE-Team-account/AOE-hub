import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendlyWriteError } from "@/lib/errors";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { chooseStorageBackend } from "@/lib/storage/router";
import { isStagingConfigured, isScannerConfigured } from "@/lib/storage/config";
import { PART_SIZE_BYTES, SINGLE_PUT_MAX_BYTES, presignPart, presignSinglePut, startMultipart } from "@/lib/storage/staging";
import { GAME_MAX_BYTES } from "@/lib/games";
import { ABSOLUTE_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES, isBlockedFileName, safeFileName } from "@/lib/upload-rules";
import type { MediaType } from "@/lib/types";

export const runtime = "nodejs";

// Step 1 of an upload. The browser describes what it wants to send; this checks
// everything (who, how big, what kind, daily allowance, links), creates the
// post, and hands back short-lived private addresses to send each file to. The
// file itself never passes through this server.

const MAX_FILES = 20;

interface FileSpec { name: string; size: number; type: string }
interface InstructionSingle { mode: "single"; url: string }
interface InstructionMultipart { mode: "multipart"; partSize: number; urls: string[] }

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to upload." }, { status: 401 });
  if (!isStagingConfigured || !isScannerConfigured) {
    return NextResponse.json({ error: "Uploads are not available right now.", code: "unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const title = str("title");
  const description = str("description");
  const section = str("section");
  const mediaType = str("mediaType");
  const authorship = str("authorship");
  const remixOfPostId = str("remixOfPostId") || null;
  const madeWithAi = body.madeWithAi === true;
  const labels = Array.isArray(body.labels) ? (body.labels as unknown[]).map((l) => (typeof l === "string" ? l.slice(0, 120) : "")) : [];
  const specs: FileSpec[] = (Array.isArray(body.files) ? (body.files as unknown[]) : []).slice(0, MAX_FILES + 1).map((f) => {
    const o = (f ?? {}) as Record<string, unknown>;
    return { name: typeof o.name === "string" ? o.name : "", size: Number(o.size), type: typeof o.type === "string" ? o.type.slice(0, 120) : "" };
  });
  const rawLinks = Array.isArray(body.links) ? (body.links as { label?: unknown; url?: unknown }[]).slice(0, 20) : [];

  if (!title || !description || !section || !mediaType || !authorship || (specs.length === 0 && rawLinks.length === 0)) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (specs.length > MAX_FILES) return NextResponse.json({ error: `At most ${MAX_FILES} files at a time.` }, { status: 400 });
  for (const f of specs) {
    if (!f.name || !Number.isInteger(f.size) || f.size <= 0) return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
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

  // What kind of file, and how big. Programs and scripts are refused; a game or
  // app is at most 50 MB here; everything else up to the hub's limit (or the
  // member's one-time lift).
  const isGamePost = mediaType === "game" || mediaType === "app";
  const svc = createServiceRoleClient();
  const { data: maxInfo } = await svc.rpc("get_upload_max_file", { p_user: user.id });
  const m = (maxInfo ?? {}) as { normal?: number; once?: number | null; unlimited?: boolean };
  const normalMax = Math.min(Number(m.normal ?? DEFAULT_MAX_FILE_BYTES), ABSOLUTE_MAX_FILE_BYTES);
  const onceMax = m.once ? Math.min(Number(m.once), ABSOLUTE_MAX_FILE_BYTES) : null;
  const effectiveMax = m.unlimited ? ABSOLUTE_MAX_FILE_BYTES : Math.max(normalMax, onceMax ?? 0);
  let usesLift = false;
  let liftedBytes = 0;
  for (const f of specs) {
    if (isBlockedFileName(f.name)) return NextResponse.json({ error: "This type of file cannot be uploaded here.", code: "blocked-type", name: f.name }, { status: 400 });
    if (isGamePost && f.size > GAME_MAX_BYTES) return NextResponse.json({ error: "A game or app can be at most 50 MB here.", code: "game-too-big", name: f.name }, { status: 413 });
    if (f.size > effectiveMax) {
      const kind = mediaType === "video" || mediaType === "audio" ? "media" : "document";
      return NextResponse.json({ error: "This file is too big.", code: kind === "media" ? "too-big-media" : "too-big-document", name: f.name, max: effectiveMax }, { status: 413 });
    }
    if (!m.unlimited && f.size > normalMax) { usesLift = true; liftedBytes += f.size; }
  }

  // The daily allowance. A file that uses the one-time lift is outside the daily size limit.
  const totalBytes = specs.reduce((n, f) => n + f.size, 0) - liftedBytes;
  const allowance = await svc.rpc("take_upload_allowance", { p_user: user.id, p_files: specs.length + links.length, p_bytes: totalBytes });
  if (allowance.error) {
    console.error("Upload allowance check failed:", allowance.error.message);
    return NextResponse.json({ error: "Could not check your upload allowance. Please try again." }, { status: 500 });
  }
  const allow = allowance.data as { ok: boolean; files_left: number | null; bytes_left: number | null };
  if (!allow.ok) {
    return NextResponse.json({ error: "Daily upload limit reached.", code: "daily-limit", filesLeft: allow.files_left, bytesLeft: allow.bytes_left }, { status: 429 });
  }
  const refund = async (files: number, bytes: number) => {
    await svc.rpc("refund_upload_allowance", { p_user: user.id, p_files: files, p_bytes: bytes });
  };

  // Created by the server (AOE-SEC-05): members cannot insert file posts directly any more.
  const { data: post, error: postError } = await svc
    .rpc("create_file_post", {
      p_author: user.id, p_title: title, p_description: description, p_section: section, p_media_type: mediaType,
      p_authorship: authorship, p_remix_of: remixOfPostId, p_made_with_ai: madeWithAi,
    })
    .single<{ id: string }>();
  if (postError || !post) {
    await refund(specs.length + links.length, totalBytes);
    return NextResponse.json({ error: postError ? friendlyWriteError(postError) : "Could not create the post." }, { status: 500 });
  }

  const files: { assetId: string; label: string; size: number; type: string; upload: InstructionSingle | InstructionMultipart }[] = [];
  try {
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const assetId = randomUUID();
      const cleanName = safeFileName(spec.name);
      const contentType = spec.type || "application/octet-stream";
      const stagingKey = `${post.id}/${assetId}`;
      const finalKey = `${post.id}/${randomUUID()}-${cleanName}`;
      const backend = chooseStorageBackend(spec.size, mediaType as MediaType);
      const multipart = spec.size > SINGLE_PUT_MAX_BYTES;
      const uploadId = multipart ? await startMultipart(stagingKey, contentType) : null;

      let assetError: { message: string } | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await svc.from("file_assets").insert({
          id: assetId,
          file_post_id: post.id,
          label: labels[i] || cleanName,
          original_name: cleanName,
          mime_type: contentType,
          size_bytes: spec.size,
          scan_status: "uploading",
          staging_key: stagingKey,
          final_key: finalKey,
          final_backend: backend,
          multipart_upload_id: uploadId,
        });
        assetError = res.error;
        if (!assetError || !/fetch failed|ECONNRESET|timeout/i.test(assetError.message)) break;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
      if (assetError) throw new Error(assetError.message);

      if (multipart && uploadId) {
        const count = Math.ceil(spec.size / PART_SIZE_BYTES);
        const urls = await Promise.all(Array.from({ length: count }, (_, n) => presignPart(stagingKey, uploadId, n + 1)));
        files.push({ assetId, label: labels[i] || cleanName, size: spec.size, type: contentType, upload: { mode: "multipart", partSize: PART_SIZE_BYTES, urls } });
      } else {
        files.push({ assetId, label: labels[i] || cleanName, size: spec.size, type: contentType, upload: { mode: "single", url: await presignSinglePut(stagingKey, contentType) } });
      }
    }
  } catch (err) {
    console.error("Could not prepare the upload:", err instanceof Error ? err.message : err);
    await svc.from("file_posts").delete().eq("id", post.id);
    await refund(specs.length + links.length, totalBytes);
    return NextResponse.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
  }

  // Links have nothing to store or scan: record them as they are.
  let linkFailures = 0;
  for (const link of links) {
    const { error: linkError } = await svc.from("file_assets").insert({
      file_post_id: post.id, label: link.label, is_link: true, link_url: link.url, link_host: link.host, scan_status: "clean",
    });
    if (linkError) { console.error("Failed to record link:", linkError); linkFailures++; }
  }
  if (linkFailures > 0) await refund(linkFailures, 0);

  if (usesLift) await svc.rpc("consume_one_time_max", { p_user: user.id });
  return NextResponse.json({ postId: post.id, files });
}
