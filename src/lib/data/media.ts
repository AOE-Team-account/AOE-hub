import { createClient } from "@/lib/supabase/server";
import type { MediaRef } from "@/lib/media";

// The preview pictures and videos of a set of posts. Row-level security keeps
// anything that has not passed the check (or whose post is hidden) out.
export async function mediaFor(ownerType: "file" | "experience", ownerIds: string[]): Promise<Record<string, MediaRef[]>> {
  if (ownerIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("post_media")
    .select("id, owner_id, kind, sort_order")
    .eq("owner_type", ownerType)
    .eq("scan_status", "clean")
    .in("owner_id", ownerIds)
    .order("sort_order");
  const out: Record<string, MediaRef[]> = {};
  for (const r of (data ?? []) as { id: string; owner_id: string; kind: "image" | "video" }[]) {
    (out[r.owner_id] ??= []).push({ id: r.id, kind: r.kind });
  }
  return out;
}
