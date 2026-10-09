// Data-access layer for the Admin Dashboard — queries the real `reports`,
// and `profiles` tables. RLS already restricts `reports` reads to
// admins (see supabase/schema.sql), so these will simply return nothing for
// a non-admin caller.
//
// Deliberate rule from project memory: users only ever show up here
// when reported, or when an admin searches for them directly — never a
// default scrollable list. These functions preserve that on purpose.

import { createClient } from "@/lib/supabase/server";
import { userFromProfileRow, type ProfileRow } from "@/lib/profile";
import type { AdminReport, User } from "@/lib/types";

interface ReportRow {
  id: string;
  target_type: AdminReport["targetType"];
  target_id: string;
  reason: AdminReport["reason"];
  details: string | null;
  status: AdminReport["status"];
  created_at: string;
}

export async function listOpenReports(): Promise<AdminReport[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return ((data ?? []) as ReportRow[]).map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    details: row.details ?? undefined,
    createdAt: row.created_at,
    status: row.status,
  }));
}

export async function searchUsers(query: string): Promise<User[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").ilike("name", `%${q}%`);
  return (data ?? []).map((row) => userFromProfileRow(row as ProfileRow));
}
