import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getR2MediaUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";

// Serves a preview picture or video by sending the browser to a short-lived
// storage link. Visibility is decided by the database: only previews that
// passed the check (and whose post may be seen) are returned.
export async function GET(_request: Request, { params }: RouteContext<"/api/media/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createClient();
  const { data: row } = await supabase.from("post_media").select("storage_path, storage_backend, scan_status").eq("id", id).maybeSingle();
  if (!row || row.scan_status !== "clean" || !row.storage_path || row.storage_backend !== "r2") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const url = await getR2MediaUrl(row.storage_path as string);
  return NextResponse.redirect(url, { headers: { "cache-control": "private, max-age=600" } });
}
