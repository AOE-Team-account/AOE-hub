import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signGameToken } from "@/lib/game-token";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A signed-in member asks to play a game: POST { assetId } -> { token }.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { assetId?: unknown };
  if (typeof body.assetId !== "string" || !UUID.test(body.assetId)) return NextResponse.json({ error: "Unknown game." }, { status: 400 });
  return NextResponse.json({ token: signGameToken(body.assetId) }, { headers: { "cache-control": "no-store" } });
}
