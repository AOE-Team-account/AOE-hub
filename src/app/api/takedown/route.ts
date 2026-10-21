import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { rateLimited } from "@/lib/ai/server/rate-limit";

export const runtime = "nodejs";

// A formal copyright takedown notice. Anyone may send one, signed in or not.
// It is stored whole, and, when the address points at a post, file or comment
// of the hub, a report is opened so the right reviewers see it first.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`takedown:${ip}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many notices from this connection. Please try again later.", code: "slow" }, { status: 429 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = text(b.name, 200);
  const email = text(b.email, 200);
  const address = text(b.address, 500);
  const rightsHolder = text(b.rightsHolder, 200);
  const original = text(b.original, 2000);
  const url = text(b.url, 500);
  const signature = text(b.signature, 200);
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || original.length < 10 || url.length < 5 || signature.length < 2 || b.goodFaith !== true || b.accurate !== true) {
    return NextResponse.json({ error: "Please fill in every required part.", code: "invalid" }, { status: 400 });
  }

  // Which item of the hub does the address point at?
  let targetType: "file" | "experience-post" | "comment" | null = null;
  let targetId: string | null = null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const id = u.pathname.match(UUID)?.[0] ?? null;
    if (id && u.pathname.startsWith("/files/")) { targetType = "file"; targetId = id; }
    else if (id && u.pathname.startsWith("/experience/")) { targetType = "experience-post"; targetId = id; }
  } catch { /* an address that is not a web address is still kept */ }

  const svc = createServiceRoleClient();
  if (targetType && targetId) {
    const table = targetType === "file" ? "file_posts" : "experience_posts";
    const { data: exists } = await svc.from(table).select("id").eq("id", targetId).maybeSingle();
    if (!exists) { targetType = null; targetId = null; }
  }

  const { data: notice, error } = await svc.from("takedown_notices").insert({
    claimant_name: name, claimant_email: email, claimant_address: address || null, rights_holder: rightsHolder || null,
    original_work: original, infringing_url: url, target_type: targetType, target_id: targetId,
    good_faith: true, accuracy_statement: true, signature,
  }).select("id").single();
  if (error || !notice) {
    console.error("Takedown notice not saved:", error?.message);
    return NextResponse.json({ error: "Could not save the notice. Please try again." }, { status: 500 });
  }

  if (targetType && targetId) {
    const { data: report } = await svc.from("reports").insert({
      target_type: targetType, target_id: targetId, reason: "copyright",
      details: `Formal copyright notice from ${name}. Original work: ${original.slice(0, 300)}`,
      takedown_id: notice.id, urgent: false,
    }).select("id").single();
    if (report) await svc.from("takedown_notices").update({ report_id: report.id }).eq("id", notice.id);
  }

  // The Creator is told either way (a notice that points nowhere still needs a person).
  const { data: creators } = await svc.from("user_roles").select("user_id").eq("role", "creator");
  if (creators?.length) {
    await svc.from("notifications").insert(creators.map((c) => ({
      user_id: c.user_id, body: "A formal copyright takedown notice arrived. Open the Creator panel to see it.", kind: "takedown-notice", data: { notice_id: notice.id },
    })));
  }
  return NextResponse.json({ ok: true });
}
