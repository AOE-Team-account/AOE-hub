// Data-access layer for users/profiles — queries the real `profiles` table.

import { createClient } from "@/lib/supabase/server";
import { userFromProfileRow, type ProfileRow } from "@/lib/profile";
import type { User } from "@/lib/types";

export async function getUserById(id: string): Promise<User | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
  return data ? userFromProfileRow(data as ProfileRow) : undefined;
}

export async function listUsers(): Promise<User[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*");
  return (data ?? []).map((row) => userFromProfileRow(row as ProfileRow));
}
