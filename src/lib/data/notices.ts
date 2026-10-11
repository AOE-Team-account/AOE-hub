import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NoticeMap = Record<string, { tier: string; body: string }>;

// Reviewer notices for a set of items of one kind. Notices are public (they
// name a tier, never a person), so this works for any visitor.
export async function getNotices(supabase: SupabaseClient, kind: "file" | "post" | "comment", ids: string[]): Promise<NoticeMap> {
  if (ids.length === 0) return {};
  const { data } = await supabase.from("item_notices").select("item_id, tier, body").eq("item_kind", kind).in("item_id", ids);
  return Object.fromEntries(((data ?? []) as { item_id: string; tier: string; body: string }[]).map((n) => [n.item_id, { tier: n.tier, body: n.body }]));
}

export function flattenCommentIds(comments: { id: string; replies?: { id: string }[] }[]): string[] {
  return comments.flatMap((c) => [c.id, ...(c.replies ?? []).map((r) => r.id)]);
}
