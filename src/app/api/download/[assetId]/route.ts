import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
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

  // First ask with the member's own key: the row rules decide whether this member
  // may see the file at all (clean, post not deleted, author active).
  const { data: visible } = await supabase.from("file_assets").select("id, scan_status").eq("id", assetId).maybeSingle();
  if (!visible || visible.scan_status !== "clean") {
    return NextResponse.json({ error: "This file isn't available for download." }, { status: 404 });
  }
  // Where it is stored is server-only (AOE-SEC-25), so that part is read with the server key.
  const { data: asset } = await createServiceRoleClient()
    .from("file_assets")
    .select("id, storage_path, storage_backend, scan_status, original_name, label")
    .eq("id", visible.id)
    .maybeSingle();

  if (!asset || asset.scan_status !== "clean" || !asset.storage_path || !asset.storage_backend) {
    return NextResponse.json({ error: "This file isn't available for download." }, { status: 404 });
  }

  const url = await getDownloadUrl(asset.storage_backend as StorageBackend, asset.storage_path, asset.original_name || asset.label);

  // Fire-and-forget: counts the download (see record_download() in schema.sql).
  // Not blocking the redirect on this, so a slow count never slows a download.
  createServiceRoleClient().rpc("record_download", { p_asset_id: assetId, p_downloader_id: user.id }).then(({ error }) => {
    if (error) console.error("record_download failed:", error);
  });

  return NextResponse.redirect(url);
}
