import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BadgeRole = "answerer" | "verified";

// Public badge roles for a set of people. Only these two roles are readable
// by everyone (see the user_roles policy); staff roles never appear here.
export async function getBadgeMap(supabase: SupabaseClient, ids: string[]): Promise<Record<string, BadgeRole[]>> {
  if (ids.length === 0) return {};
  const { data } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids).in("role", ["answerer", "verified"]);
  const map: Record<string, BadgeRole[]> = {};
  for (const row of (data ?? []) as { user_id: string; role: BadgeRole }[]) {
    (map[row.user_id] ??= []).push(row.role);
  }
  return map;
}
