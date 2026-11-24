import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { answerQuestion } from "@/lib/ai/server/answer";
import { AIProviderError } from "@/lib/ai/server/chat-providers";
import { AINotConfiguredError } from "@/lib/ai/server/config";
import { rateLimitedShared } from "@/lib/ai/server/rate-limit";
import type { AIHistoryTurn, LanguageCode } from "@/lib/ai/types";
import { clientIp, clientNetwork } from "@/lib/client-ip";
import { answerSignatureOk, signAnswer } from "@/lib/ai/server/history-sig";
import { hubAiDailyCap, hubAiGuestDailyCap, takeBudget } from "@/lib/translate/budget";

export const runtime = "nodejs";

// Any well-formed language code is accepted (languages beyond the three written ones are added by AI).
const LANG_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const MAX_MESSAGE = 1000;

export async function POST(request: Request) {
  let body: { message?: unknown; lang?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const lang: LanguageCode = typeof body.lang === "string" && LANG_PATTERN.test(body.lang) ? body.lang : "en";
  if (!message || message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: `Please ask a question of 1–${MAX_MESSAGE} characters.` }, { status: 400 });
  }

  const history: AIHistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((t): t is AIHistoryTurn => !!t && (t.from === "ai" || t.from === "user") && typeof t.text === "string")
        // An "AI" turn counts only if this server wrote it (AOE-SEC-20).
        .filter((t) => t.from === "user" || answerSignatureOk(t.text, t.sig))
        .slice(-6)
        .map((t) => ({ from: t.from, text: t.text.slice(0, t.from === "ai" ? 4000 : MAX_MESSAGE) }))
    : [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ip = clientIp(request);
  // Local testing only: AI_RATE_LIMIT=off lifts the limit, and only for requests made to localhost.
  const testing = process.env.AI_RATE_LIMIT === "off" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.get("host") ?? "");
  // Signed-out visitors are counted by address (AOE-SEC-24). When the address can't be
  // known safely (CLIENT_IP_HEADER / TRUSTED_PROXY_COUNT not set, or the header is
  // missing), a signed-out question is not answered: there is no shared "unknown"
  // allowance that one person could use up for everyone.
  if (!user && !ip && !testing) {
    return NextResponse.json({ error: "Please sign in to ask the assistant.", code: "sign-in" }, { status: 401 });
  }
  const limited = testing ? false : user
    ? await rateLimitedShared(`u:${user.id}`, 30, 10 * 60_000)
    : // Per address: 10 every 10 minutes and 20 a day; per network (IPv4 /24, IPv6 /48):
      // 60 a day. So no single address or network can take more than a small share of
      // the guests' daily allowance (hub_ai_guest_daily_cap, 300 by default).
      (await rateLimitedShared(`ip:${ip}`, 10, 10 * 60_000)) ||
      (await rateLimitedShared(`ipday:${ip}`, 20, 24 * 60 * 60_000)) ||
      (await rateLimitedShared(`netday:${clientNetwork(ip!)}`, 60, 24 * 60 * 60_000));
  if (limited) {
    return NextResponse.json({ error: "You're asking quickly — please wait a few minutes and try again." }, { status: 429 });
  }

  // Daily allowance for the hub's own AI (AOE-SEC-04). Each question costs a few AI calls,
  // so the whole hub has a daily cap, and signed-out visitors share a smaller part of it.
  if (!testing) {
    let allowed = false;
    try {
      allowed =
        (user ? true : await takeBudget("hub-ai-guest", 1, await hubAiGuestDailyCap())) &&
        (await takeBudget("hub-ai", 1, await hubAiDailyCap()));
    } catch (err) {
      console.error("AI allowance check failed:", err instanceof Error ? err.message : err);
    }
    if (!allowed) {
      return NextResponse.json(
        { error: user ? "The assistant has answered all it can for today. Please try again tomorrow." : "The assistant is paused for visitors for today. Sign in, or try again tomorrow.", code: "paused" },
        { status: 503 }
      );
    }
  }

  try {
    const reply = await answerQuestion({ message, lang, history, userId: user?.id ?? null });
    return NextResponse.json({ ...reply, sig: signAnswer(reply.text) });
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
