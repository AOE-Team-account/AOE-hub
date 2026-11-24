// Data-access layer for users/profiles — queries the real `profiles` table.

import { createClient } from "@/lib/supabase/server";
import { userFromProfileRow, type ProfileRow, PUBLIC_PROFILE_COLUMNS } from "@/lib/profile";
import type { User } from "@/lib/types";
import { getBadgeMap } from "@/lib/data/badges";

export async function getUserById(id: string): Promise<User | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", id).single();
  if (!data) return undefined;
  const badges = await getBadgeMap(supabase, [id]);
  return userFromProfileRow(data as ProfileRow, [], undefined, badges[id] ?? []);
}

export async function listUsers(): Promise<User[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS);
  const badges = await getBadgeMap(supabase, (data ?? []).map((r) => r.id as string));
  return (data ?? []).map((row) => userFromProfileRow(row as ProfileRow, [], undefined, badges[row.id as string] ?? []));
}
