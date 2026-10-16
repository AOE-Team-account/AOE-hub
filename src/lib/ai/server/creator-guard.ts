import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Guard = { ok: true; userId: string } | { ok: false; response: NextResponse };

// For routes only the Creator may call (the AI and knowledge tools). Uses the
// caller's own session and checks, fresh on every request, that they hold the
// Creator role AND have passed the extra sign-in steps (two-step code and
// access code, not idle for more than 30 minutes). The database applies the
// same check again to everything it is asked to do.
export async function requireCreator(): Promise<Guard> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const { data: status } = await supabase.rpc("creator_status");
  if (!status?.is_creator) return { ok: false, response: NextResponse.json({ error: "Only the Creator can do this." }, { status: 403 }) };
  if (!status.unlocked) return { ok: false, response: NextResponse.json({ error: "Unlock the Creator panel first." }, { status: 403 }) };
  return { ok: true, userId: user.id };
}
