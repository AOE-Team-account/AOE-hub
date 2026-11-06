import { NextResponse } from "next/server";
import { requireBuzzStaff } from "@/lib/buzzora/guard";
import { cleanText } from "@/lib/buzzora/text";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// The Creator or a Watcher moves a Buzzora post to another tab or fixes its country.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBuzzStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const b = (await request.json().catch(() => null)) as { kind?: unknown; country?: unknown } | null;
  const update: Record<string, string> = {};
  const kind = ["news", "law", "regulation"].find((k) => k === b?.kind);
  if (kind) update.buzz_kind = kind;
  const country = cleanText(b?.country, 60);
  if (country.length >= 2) update.country = country;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const { data, error } = await createServiceRoleClient().from("experience_posts").update(update).eq("id", id).eq("board", "buzzora").is("deleted_at", null).select("id");
  if (error || !data?.length) return NextResponse.json({ error: "Could not change that post." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
