import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteFromR2 } from "@/lib/storage/r2";

export const runtime = "nodejs";

// A reviewer, having looked at a reported profile picture, removes it. The
// database function checks the reviewer's role, refuses self-review, closes the
// report and sends the member the notice; this route then deletes the stored file.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { userId?: string; reportId?: string };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!body.userId || !body.reportId || !uuid.test(body.userId) || !uuid.test(body.reportId)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: oldPath, error } = await supabase.rpc("remove_profile_picture", { p_user_id: body.userId, p_report_id: body.reportId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (typeof oldPath === "string" && oldPath) {
    try { await deleteFromR2(oldPath); } catch (err) { console.error("Could not delete the removed picture:", err); }
  }
  return NextResponse.json({ ok: true });
}
