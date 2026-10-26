import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { finishMultipart, stagedSize, deleteStaged, readStaged, abortMultipart } from "@/lib/storage/staging";
import { uploadToR2, deleteFromR2Prefix } from "@/lib/storage/r2";
import { GameZipError, inspectGameZip } from "@/lib/games";
import { runScan } from "@/lib/scanner/run";

export const runtime = "nodejs";
export const maxDuration = 300;

// Step 2 of an upload: the browser says every file has been sent. This joins
// the parts of big files, checks that what arrived is what was announced, looks
// inside game zips, and starts the virus scan. The file stays hidden (and the
// member is told it is being scanned) until the scan says it is clean.

interface PartIn { PartNumber: number; ETag: string }

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  let body: { postId?: unknown; files?: { assetId?: unknown; parts?: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const postId = typeof body.postId === "string" ? body.postId : "";
  const wanted = (Array.isArray(body.files) ? body.files : []).slice(0, 25);
  if (!postId || wanted.length === 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const svc = createServiceRoleClient();
  const { data: post } = await svc.from("file_posts").select("id, author_id, media_type").eq("id", postId).maybeSingle();
  if (!post || post.author_id !== user.id) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const results: { assetId: string; status: "pending" | "failed"; code?: string; error?: string }[] = [];
  const toScan: string[] = [];

  for (const w of wanted) {
    const assetId = typeof w.assetId === "string" ? w.assetId : "";
    const { data: asset } = await svc
      .from("file_assets")
      .select("id, file_post_id, label, size_bytes, staging_key, multipart_upload_id, scan_status, original_name")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset || asset.file_post_id !== postId || asset.scan_status !== "uploading" || !asset.staging_key) {
      results.push({ assetId, status: "failed", code: "not-found", error: "That file is not waiting for an upload." });
      continue;
    }

    const fail = async (code: string, message: string) => {
      if (asset.multipart_upload_id) await abortMultipart(asset.staging_key as string, asset.multipart_upload_id);
      await deleteStaged(asset.staging_key as string);
      await svc.from("file_assets").update({ scan_status: "error", scan_finished_at: new Date().toISOString() }).eq("id", asset.id);
      await svc.rpc("refund_upload_allowance", { p_user: user.id, p_files: 1, p_bytes: Number(asset.size_bytes ?? 0) });
      results.push({ assetId, status: "failed", code, error: message });
    };

    try {
      if (asset.multipart_upload_id) {
        const parts = Array.isArray(w.parts) ? (w.parts as PartIn[]) : [];
        const clean = parts
          .filter((p) => p && Number.isInteger(p.PartNumber) && p.PartNumber > 0 && typeof p.ETag === "string" && p.ETag.length > 0 && p.ETag.length < 200)
          .map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag }));
        if (clean.length === 0) {
          await fail("incomplete", "Not every part arrived.");
          continue;
        }
        await finishMultipart(asset.staging_key, asset.multipart_upload_id, clean);
      }
      const size = await stagedSize(asset.staging_key);
      if (size === null || size !== Number(asset.size_bytes)) {
        await fail("incomplete", "The file did not arrive in full.");
        continue;
      }

      // A game: look inside the zip (never run it) and unpack it where it will be played from, hidden until the scan passes.
      const isGame = post.media_type === "game" || post.media_type === "app";
      if (isGame && /\.zip$/i.test(asset.original_name ?? "")) {
        let plan;
        try {
          plan = inspectGameZip(await readStaged(asset.staging_key));
        } catch (err) {
          if (err instanceof GameZipError) {
            await fail("game-invalid", err.message);
            continue;
          }
          throw err;
        }
        // (A zip without an index.html at the top is an ordinary download, not a game.)
        if (plan) {
          const prefix = `games/${asset.id}/`;
          try {
            const queue = [...plan];
            await Promise.all(
              Array.from({ length: 6 }, async () => {
                for (let f = queue.shift(); f; f = queue.shift()) await uploadToR2(prefix + f.path, Buffer.from(f.data), f.mime);
              })
            );
            await svc.from("file_assets").update({ is_game: true, game_prefix: prefix }).eq("id", asset.id);
          } catch (err) {
            console.error("Could not unpack the game:", err instanceof Error ? err.message : err);
            await deleteFromR2Prefix(prefix).catch(() => undefined);
          }
        }
      }

      await svc.from("file_assets").update({ scan_status: "pending", multipart_upload_id: null }).eq("id", asset.id);
      toScan.push(asset.id);
      results.push({ assetId, status: "pending" });
    } catch (err) {
      console.error("Could not finish the upload:", err instanceof Error ? err.message : err);
      await fail("failed", "Could not finish the upload.");
    }
  }

  // The scan runs after the answer is sent, so the member is not kept waiting.
  after(async () => {
    await Promise.all(toScan.map((id) => runScan(id).catch((e) => console.error("Scan failed to run:", e instanceof Error ? e.message : e))));
  });
  return NextResponse.json({ postId, results });
}
