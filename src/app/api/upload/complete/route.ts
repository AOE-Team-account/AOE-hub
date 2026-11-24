import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { finishMultipart, deleteStaged, readSealed, sealStaged, abortMultipart } from "@/lib/storage/staging";
import { GameZipError } from "@/lib/games";
import { checkGameZip } from "@/lib/games-unpack";
import { runScan } from "@/lib/scanner/run";

export const runtime = "nodejs";
export const maxDuration = 300;

// Step 2 of an upload: the browser says every file has been sent. This joins
// the parts of big files, checks that what arrived is what was announced, seals
// the file under a new key no upload link points at (so it cannot be swapped
// after this point; AOE-SEC-01), checks game zips, and starts the virus scan.
// The file stays hidden (and the member is told it is being scanned) until the
// scan says it is clean. Games are unpacked only AFTER the scan, from the exact
// bytes that were scanned (see runScan).

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

    let stagingKey = asset.staging_key as string;
    const fail = async (code: string, message: string) => {
      if (asset.multipart_upload_id) await abortMultipart(asset.staging_key as string, asset.multipart_upload_id);
      await deleteStaged(asset.staging_key as string);
      if (stagingKey !== asset.staging_key) await deleteStaged(stagingKey);
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
      // Seal it: from here on only this exact copy is scanned and published.
      const sealed = await sealStaged(asset.staging_key, Number(asset.size_bytes));
      if (!sealed) {
        await fail("incomplete", "The file did not arrive in full.");
        continue;
      }
      stagingKey = sealed.key;
      const { error: sealError } = await svc
        .from("file_assets")
        .update({ staging_key: sealed.key, staged_etag: sealed.etag, multipart_upload_id: null })
        .eq("id", asset.id)
        .eq("scan_status", "uploading");
      if (sealError) throw new Error(sealError.message);

      // A game: look inside the zip now (never run it) so an unsafe zip is refused at once.
      // It is unpacked only after the virus scan, from the scanned copy.
      const isGame = post.media_type === "game" || post.media_type === "app";
      if (isGame && /\.zip$/i.test(asset.original_name ?? "")) {
        try {
          await checkGameZip(() => readSealed(sealed.key, sealed.etag));
        } catch (err) {
          if (err instanceof GameZipError) {
            await fail("game-invalid", err.message);
            continue;
          }
          throw err;
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
