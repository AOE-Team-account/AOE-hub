import { NextResponse } from "next/server";
import { requireBuzzStaff } from "@/lib/buzzora/guard";
import { ensureSystemUser } from "@/lib/buzzora/system-user";
import { cleanText } from "@/lib/buzzora/text";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { rateLimitedShared } from "@/lib/ai/server/rate-limit";

export const runtime = "nodejs";

// The Creator or a Watcher posts to the Buzzora Board by hand. The post is
// written as AOEhub (so no staff name shows); who wrote it is kept privately in posted_by.
export async function POST(request: Request) {
  const guard = await requireBuzzStaff();
  if (!guard.ok) return guard.response;
  if (await rateLimitedShared(`buzz-post:${guard.userId}`, 20, 60 * 60_000)) return NextResponse.json({ error: "Too many posts this hour." }, { status: 429 });

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const kind = ["news", "law", "regulation"].find((k) => k === b.kind);
  const title = cleanText(b.title, 140), country = cleanText(b.country, 60), summary = cleanText(b.summary, 1600), limits = cleanText(b.limits, 600);
  const publisher = cleanText(b.sourcePublisher, 80), sourceTitle = cleanText(b.sourceTitle, 200) || title;
  let sourceUrl = "";
  try { const u = new URL(String(b.sourceUrl ?? "")); if (u.protocol === "https:" && !u.username && !u.password) sourceUrl = u.toString(); } catch { /* invalid */ }
  if (!kind || title.length < 8 || country.length < 2 || summary.length < 40 || !sourceUrl || publisher.length < 2) {
    return NextResponse.json({ error: "Please fill in the tab, country, headline, summary, and a source (publisher and an https link)." }, { status: 400 });
  }
  const body = `${summary}${limits ? `\n\nImportant limits: ${limits}` : ""}\n\nSources: ${publisher}.`;
  const db = createServiceRoleClient();
  const { data, error } = await db.from("experience_posts").insert({
    author_id: await ensureSystemUser(), board: "buzzora", buzz_kind: kind, country, title, body, is_ai: false, posted_by: guard.userId,
    sources: [{ title: sourceTitle, url: sourceUrl, publisher }],
  }).select("id").single();
  if (error) return NextResponse.json({ error: "Could not save the post." }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
