import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDownloadUrl, type StorageBackend } from "@/lib/storage/router";

export async function GET(request: Request, { params }: RouteContext<"/api/download/[assetId]">) {
  const { assetId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to download." }, { status: 401 });
  }

  const { data: asset } = await supabase
    .from("file_assets")
    .select("id, storage_path, storage_backend, scan_status")
    .eq("id", assetId)
    .single();

  if (!asset || asset.scan_status !== "clean" || !asset.storage_path || !asset.storage_backend) {
    return NextResponse.json({ error: "This file isn't available for download." }, { status: 404 });
  }

  const url = await getDownloadUrl(asset.storage_backend as StorageBackend, asset.storage_path);

  // Fire-and-forget: increments the download counter and awards the
  // uploader points (see record_download() in schema.sql). Not blocking
  // the redirect on this — a slow points update shouldn't slow downloads.
  supabase.rpc("record_download", { p_asset_id: assetId, p_downloader_id: user.id }).then(({ error }) => {
    if (error) console.error("record_download failed:", error);
  });

  return NextResponse.redirect(url);
}
