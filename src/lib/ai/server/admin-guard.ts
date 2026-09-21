import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// For routes only admins may call. Uses the caller's own session, so the
// is_admin flag is read under normal Row Level Security.
export async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { ok: false, response: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  return { ok: true, userId: user.id };
}
