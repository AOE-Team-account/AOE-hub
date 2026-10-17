import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimited } from "@/lib/ai/server/rate-limit";
import { languageIsAvailable } from "@/lib/translate/languages";
import { parseRequests, translateItems } from "@/lib/translate/content";

export const runtime = "nodejs";

// Translates what members wrote, on request of the page showing it:
// POST { lang, items: [{ type, id, field }] }. The text is read from the
// database through the caller's own session (so only what they may see).
export async function POST(request: Request) {
  let body: { lang?: unknown; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const lang = typeof body.lang === "string" ? body.lang : "";
  const available = await languageIsAvailable(lang);
  if (!available.ok) return NextResponse.json({ error: "Unknown language." }, { status: 400 });
  const items = parseRequests(body.items);
  if (items.length === 0) return NextResponse.json({ results: {} });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const limited = user ? rateLimited(`tr:u:${user.id}`, 60, 60_000) : rateLimited(`tr:ip:${ip}`, 20, 60_000);
  if (limited) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const results = await translateItems(supabase, items, lang, available.englishName);
  return NextResponse.json({ results });
}
