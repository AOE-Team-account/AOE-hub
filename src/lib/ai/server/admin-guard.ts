import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Guard = { ok: true; userId: string } | { ok: false; response: NextResponse };

// For routes only staff may call. Uses the caller's own session and reads
// their own role rows under normal Row Level Security, so the answer is
// checked fresh on every request (a removed role stops working at once).
async function requireRole(allowed: string[], message: string): Promise<Guard> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  if (!(rows ?? []).some((r) => allowed.includes(r.role as string))) {
    return { ok: false, response: NextResponse.json({ error: message }, { status: 403 }) };
  }
  // The database also requires the extra sign-in steps (Creator unlocked,
  // two-step for Watchers); ask it, so a password-only session is refused here too.
  const creatorOnly = allowed.length === 1 && allowed[0] === "creator";
  if (creatorOnly) {
    const { data: status } = await supabase.rpc("creator_status");
    if (!status?.unlocked) return { ok: false, response: NextResponse.json({ error: "Unlock the Creator panel first." }, { status: 403 }) };
  } else {
    const { data: ok } = await supabase.rpc("am_i_admin");
    if (!ok) return { ok: false, response: NextResponse.json({ error: "Finish the extra sign-in steps first." }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}

/** Creator or Watcher (the current admin dashboard). */
export function requireAdmin(): Promise<Guard> {
  return requireRole(["creator", "watcher"], "Admins only.");
}

/** Creator only (account deletion, role changes). */
export function requireCreator(): Promise<Guard> {
  return requireRole(["creator"], "Only the Creator can do this.");
}
