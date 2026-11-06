import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

type Guard = { ok: true; userId: string } | { ok: false; response: NextResponse };

// For routes only the Creator and Watchers may call (posting to the Buzzora
// Board by hand, adding a video link). Checks the signed-in person's role
// fresh on every request, and the extra two-step sign-in when the hub requires it.
export async function requireBuzzStaff(): Promise<Guard> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const { data: roles } = await createServiceRoleClient().from("user_roles").select("role").eq("user_id", user.id);
  const isStaff = (roles ?? []).some((r) => r.role === "creator" || r.role === "watcher");
  if (!isStaff) return { ok: false, response: NextResponse.json({ error: "Only the Creator and Watchers can do this." }, { status: 403 }) };
  const { data: step } = await supabase.rpc("my_two_step_status");
  if (step?.required_for_staff && !step?.aal2) {
    return { ok: false, response: NextResponse.json({ error: "Finish your two-step sign-in first." }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}
