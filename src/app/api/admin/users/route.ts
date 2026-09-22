import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/ai/server/admin-guard";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Deleting an account needs the service role (auth.admin.deleteUser isn't
// callable from the browser under any RLS policy). Everything referencing
// profiles.id cascades — file/experience posts, comments, groups, follows,
// memberships, notifications, reports, AI settings — the same cascade this
// project's own disposable test accounts have relied on since Phase 3.
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  if (userId === guard.userId) return NextResponse.json({ error: "You can't delete your own account from here." }, { status: 400 });

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
