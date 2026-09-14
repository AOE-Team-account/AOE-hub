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
  const { count } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", row.id);

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
