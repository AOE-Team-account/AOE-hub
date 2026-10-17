import { NextResponse } from "next/server";
import { getUiStrings } from "@/lib/translate/ui-languages";

export const runtime = "nodejs";

// The interface strings of an AI-added language (empty if it is not ready).
export async function GET(request: Request) {
  const lang = new URL(request.url).searchParams.get("lang") ?? "";
  try {
    const strings = await getUiStrings(lang);
    if (!strings) return NextResponse.json({ strings: {} });
    return NextResponse.json({ strings }, { headers: { "cache-control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ strings: {} });
  }
}
