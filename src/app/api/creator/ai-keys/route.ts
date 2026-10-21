import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireCreator } from "@/lib/ai/server/creator-guard";
import { invalidateKeyPool, testPoolKey, type PoolProvider } from "@/lib/ai/server/key-pool";

export const runtime = "nodejs";

const PROVIDERS: PoolProvider[] = ["google", "groq", "qwen-intl", "qwen-cn"];

// The hub's AI key pool, Creator only. Keys go in here and never come out:
// the list holds a name and the last four characters, nothing more.
function fileKeys() {
  const rows: { provider: PoolProvider; label: string; hint: string }[] = [];
  const g = [process.env.GOOGLE_AI_API_KEY, ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => process.env[`GOOGLE_AI_API_KEY_${i}`])];
  g.forEach((k, i) => { if (k?.trim()) rows.push({ provider: "google", label: i === 0 ? "Google (settings file)" : `Google ${i + 1} (settings file)`, hint: k.trim().slice(-4) }); });
  if (process.env.GROQ_API_KEY?.trim()) rows.push({ provider: "groq", label: "Groq (settings file)", hint: process.env.GROQ_API_KEY.trim().slice(-4) });
  return rows;
}

export async function GET() {
  const guard = await requireCreator();
  if (!guard.ok) return guard.response;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_hub_ai_keys");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data ?? [], fileKeys: fileKeys() });
}

export async function POST(request: Request) {
  const guard = await requireCreator();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => ({}))) as { action?: string; provider?: string; label?: string; key?: string; id?: string; active?: boolean };
  const supabase = await createClient();
  const svc = createServiceRoleClient();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  switch (body.action) {
    case "add": {
      const provider = body.provider as PoolProvider;
      const key = (body.key ?? "").trim();
      const label = (body.label ?? "").trim();
      if (!PROVIDERS.includes(provider)) return NextResponse.json({ error: "Choose a service." }, { status: 400 });
      if (!label) return NextResponse.json({ error: "Give the key a short name so you can tell it apart." }, { status: 400 });
      if (key.length < 8 || /\s/.test(key)) return NextResponse.json({ error: "That does not look like an API key." }, { status: 400 });
      const check = await testPoolKey(provider, key);
      if (!check.ok) return NextResponse.json({ error: `${check.note} Nothing was saved.` }, { status: 400 });
      const { data: id, error } = await supabase.rpc("add_hub_ai_key", { p_provider: provider, p_label: label, p_key: key });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await svc.rpc("record_hub_ai_key_check", { p_id: id, p_ok: true, p_note: check.note });
      invalidateKeyPool();
      return NextResponse.json({ ok: true, id, note: check.note });
    }
    case "test": {
      if (!body.id || !uuid.test(body.id)) return NextResponse.json({ error: "Missing key." }, { status: 400 });
      const { data } = await svc.rpc("hub_ai_key_secrets", { p_only_active: false });
      const row = ((data ?? []) as { id: string; provider: PoolProvider; api_key: string }[]).find((r) => r.id === body.id);
      if (!row) return NextResponse.json({ error: "No such key." }, { status: 404 });
      const check = await testPoolKey(row.provider, row.api_key);
      await svc.rpc("record_hub_ai_key_check", { p_id: row.id, p_ok: check.ok, p_note: check.note });
      return NextResponse.json({ ok: check.ok, note: check.note });
    }
    case "toggle": {
      if (!body.id || !uuid.test(body.id)) return NextResponse.json({ error: "Missing key." }, { status: 400 });
      const { error } = await supabase.rpc("set_hub_ai_key_active", { p_id: body.id, p_active: Boolean(body.active) });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      invalidateKeyPool();
      return NextResponse.json({ ok: true });
    }
    case "remove": {
      if (!body.id || !uuid.test(body.id)) return NextResponse.json({ error: "Missing key." }, { status: 400 });
      const { error } = await supabase.rpc("remove_hub_ai_key", { p_id: body.id });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      invalidateKeyPool();
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
