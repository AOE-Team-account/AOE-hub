import { NextResponse } from "next/server";
import { listReadyLanguages } from "@/lib/translate/ui-languages";

export const runtime = "nodejs";

// Languages beyond the three written ones: those the AI has finished adding.
export async function GET() {
  try {
    const languages = (await listReadyLanguages()).map((l) => ({ ...l, source: "ai" as const }));
    return NextResponse.json({ languages }, { headers: { "cache-control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ languages: [] });
  }
}
