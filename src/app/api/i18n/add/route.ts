import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimited } from "@/lib/ai/server/rate-limit";
import { addLanguage, buildStep } from "@/lib/translate/ui-languages";
import { LANG_PATTERN } from "@/lib/translate/languages";
import { clientIp } from "@/lib/client-ip";

export const runtime = "nodejs";

// Step 1: name a language ({ name }). Step 2 and on: keep calling with
// { lang } until the language is ready; each call translates the next block.
export async function POST(request: Request) {
  let body: { name?: unknown; lang?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ip = clientIp(request);
  const who = user ? `u:${user.id}` : `ip:${ip}`;

  if (typeof body.lang === "string") {
    if (!LANG_PATTERN.test(body.lang)) return NextResponse.json({ error: "Invalid language." }, { status: 400 });
    if (rateLimited(`i18nbuild:${who}`, 60, 10 * 60_000)) {
      return NextResponse.json({ error: "Please wait a few minutes and try again." }, { status: 429 });
    }
    const step = await buildStep(body.lang);
    return NextResponse.json(step, { status: step.ok ? 200 : 502 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (rateLimited(`i18nadd:${who}`, 5, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "You have tried several languages. Please wait a while and try again." }, { status: 429 });
  }
  const result = await addLanguage(name);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
