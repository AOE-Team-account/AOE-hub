import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { answerQuestion } from "@/lib/ai/server/answer";
import { AIProviderError } from "@/lib/ai/server/chat-providers";
import { AINotConfiguredError } from "@/lib/ai/server/config";
import { rateLimited } from "@/lib/ai/server/rate-limit";
import type { AIHistoryTurn, LanguageCode } from "@/lib/ai/types";

export const runtime = "nodejs";

const LANGS: LanguageCode[] = ["en", "zh-CN", "zh-TW"];
const MAX_MESSAGE = 1000;

export async function POST(request: Request) {
  let body: { message?: unknown; lang?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const lang = LANGS.includes(body.lang as LanguageCode) ? (body.lang as LanguageCode) : "en";
  if (!message || message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: `Please ask a question of 1–${MAX_MESSAGE} characters.` }, { status: 400 });
  }

  const history: AIHistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((t): t is AIHistoryTurn => !!t && (t.from === "ai" || t.from === "user") && typeof t.text === "string")
        .slice(-6)
        .map((t) => ({ from: t.from, text: t.text.slice(0, MAX_MESSAGE) }))
    : [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const limited = user
    ? rateLimited(`u:${user.id}`, 30, 10 * 60_000)
    : rateLimited(`ip:${ip}`, 10, 10 * 60_000);
  if (limited) {
    return NextResponse.json({ error: "You're asking quickly — please wait a few minutes and try again." }, { status: 429 });
  }

  try {
    const reply = await answerQuestion({ message, lang, history, userId: user?.id ?? null });
    return NextResponse.json(reply);
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      console.error("AI not configured:", err.message);
      return NextResponse.json({ error: "The assistant isn't set up yet." }, { status: 503 });
    }
    if (err instanceof AIProviderError) {
      console.error("AI provider error:", err.message);
      return NextResponse.json({ error: err.message }, { status: err.status === 429 ? 429 : 502 });
    }
    console.error("AI chat failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The assistant hit a problem. Please try again." }, { status: 500 });
  }
}
