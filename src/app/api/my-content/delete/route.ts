import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { deleteFile, type StorageBackend } from "@/lib/storage/router";
import { deleteFromR2Prefix } from "@/lib/storage/r2";

export const runtime = "nodejs";

// A member deleting their own file post or experience post. The stored
// bytes (files, unpacked games, preview pictures and videos) are removed
// first, so nothing is left behind in storage; only then is the post removed.
// If any stored file cannot be removed, nothing is deleted and the member can try again.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string; id?: string };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if ((body.kind !== "file" && body.kind !== "post") || !body.id || !uuid.test(body.id)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const table = body.kind === "file" ? "file_posts" : "experience_posts";
  const { data: own } = await supabase.from(table).select("id").eq("id", body.id).eq("author_id", user.id).maybeSingle();
  if (!own) return NextResponse.json({ error: "That is not yours." }, { status: 403 });

  const svc = createServiceRoleClient();
  try {
    if (body.kind === "file") {
      const { data: assets } = await svc.from("file_assets").select("storage_backend, storage_path, game_prefix").eq("file_post_id", body.id);
      for (const a of (assets ?? []) as { storage_backend: StorageBackend | null; storage_path: string | null; game_prefix: string | null }[]) {
        if (a.storage_backend && a.storage_path) await deleteFile(a.storage_backend, a.storage_path);
        if (a.game_prefix) await deleteFromR2Prefix(a.game_prefix);
      }
    }
    const { data: media } = await svc.from("post_media").select("storage_backend, storage_path").eq("owner_type", body.kind === "file" ? "file" : "experience").eq("owner_id", body.id);
    for (const m of (media ?? []) as { storage_backend: StorageBackend; storage_path: string | null }[]) {
      if (m.storage_path) await deleteFile(m.storage_backend, m.storage_path);
    }
  } catch (err) {
    console.error("Could not remove stored files of a deleted post:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not remove the stored files. Nothing was deleted; please try again." }, { status: 500 });
  }

  // The files are gone, so the post must go too: try again if the connection to the database drops.
  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await supabase.from(table).delete().eq("id", body.id);
    if (!error) return NextResponse.json({ ok: true });
    lastError = error;
    if (!/fetch failed|ECONNRESET|timeout|network/i.test(error.message)) break;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  console.error("Could not delete a post after removing its files:", lastError?.message);
  return NextResponse.json({ error: "Could not delete it. Please try again." }, { status: 500 });
}
