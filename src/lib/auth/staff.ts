import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Who the current request is, and which roles that account holds RIGHT NOW.
// Read fresh from the database on every request: a role that has been taken
// away stops working immediately, and a saved or shared link to a panel is
// worth nothing without a live session that currently holds the role.
export async function getStaffContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null as string | null, roles: [] as string[] };
  const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return { supabase, userId: user.id, roles: (rows ?? []).map((r) => r.role as string) };
}

/**
 * For panel pages. Anyone without one of the allowed roles gets the same 404
 * as a page that does not exist, so the panel's existence is not revealed.
 */
export async function requireStaff(allowed: string[]) {
  const ctx = await getStaffContext();
  if (!ctx.userId || !ctx.roles.some((r) => allowed.includes(r))) notFound();
  return { ...ctx, userId: ctx.userId };
}
