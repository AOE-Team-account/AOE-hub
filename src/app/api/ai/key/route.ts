import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BYO_PROVIDERS, MODEL_NAME_PATTERN, type ByoProviderId } from "@/lib/ai/byo-providers";
import { AIProviderError, chatComplete } from "@/lib/ai/server/chat-providers";
import type { ChatTarget } from "@/lib/ai/server/config";
import { rateLimited } from "@/lib/ai/server/rate-limit";

export const runtime = "nodejs";

// A member's own AI key. The key is only ever (1) verified with one tiny
// request to the provider's fixed URL, then (2) written into Supabase Vault
// through a database function. It is never logged, echoed back, or stored in
// a normal column — this route only ever returns provider + model.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data } = await supabase.from("user_ai_settings").select("provider, model").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ hasKey: !!data, provider: data?.provider ?? null, model: data?.model ?? null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (rateLimited(`key:${user.id}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }

  let body: { provider?: unknown; model?: unknown; key?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const provider = BYO_PROVIDERS[body.provider as ByoProviderId];
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : provider?.defaultModel;
  if (!provider) return NextResponse.json({ error: "Choose a provider." }, { status: 400 });
  if (key.length < 8 || key.length > 512) return NextResponse.json({ error: "That doesn't look like an API key." }, { status: 400 });
  if (!model || !MODEL_NAME_PATTERN.test(model)) return NextResponse.json({ error: "That model name isn't valid." }, { status: 400 });

  const target: ChatTarget =
    provider.kind === "anthropic"
      ? { kind: "anthropic", baseUrl: provider.baseUrl, apiKey: key, model }
      : { kind: "openai-compatible", baseUrl: provider.baseUrl, apiKey: key, model };
  try {
    await chatComplete(target, [{ role: "user", content: "Reply with the single word: ok" }], { maxTokens: 16 });
  } catch (err) {
    const msg = err instanceof AIProviderError ? err.message : "Could not verify the key.";
    return NextResponse.json({ error: `${msg} Check the key and model name, then try again.` }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_my_ai_key", { p_provider: provider.id, p_model: model, p_key: key });
  if (error) return NextResponse.json({ error: "Could not save the key." }, { status: 500 });
  return NextResponse.json({ hasKey: true, provider: provider.id, model });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { error } = await supabase.rpc("remove_my_ai_key");
  if (error) return NextResponse.json({ error: "Could not remove the key." }, { status: 500 });
  return NextResponse.json({ hasKey: false });
}
