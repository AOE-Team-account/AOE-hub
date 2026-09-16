// Data-access layer for Groups — queries the real `groups` table. RLS
// (see supabase/schema.sql) already restricts private groups to members +
// admins, so this can just select * without extra visibility filtering.

import { createClient } from "@/lib/supabase/server";
import type { Group } from "@/lib/types";

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  visibility: Group["visibility"];
  reported: boolean;
  created_at: string;
}

async function fromRow(row: GroupRow): Promise<Group> {
  const supabase = await createClient();
  // group_member_count() bypasses the group_members RLS deliberately — see
  // the comment on that function in schema.sql for why that's safe here.
  const { data: count } = await supabase.rpc("group_member_count", { p_group_id: row.id });

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    visibility: row.visibility,
    memberCount: count ?? 0,
    createdAt: row.created_at,
    reported: row.reported,
  };
}

export async function listGroups(): Promise<Group[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("groups").select("*").order("created_at", { ascending: false });
  return Promise.all(((data ?? []) as GroupRow[]).map(fromRow));
}

export async function getGroupById(id: string): Promise<Group | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("groups").select("*").eq("id", id).single();
  return data ? fromRow(data as GroupRow) : undefined;
}

/** Group IDs the currently-authenticated user belongs to. Empty for a guest. */
export async function listMyGroupIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
  return (data ?? []).map((row) => row.group_id);
}
