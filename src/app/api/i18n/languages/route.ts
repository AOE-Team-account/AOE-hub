import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Languages beyond the three written ones. Filled from the database when
// automatic languages are switched on (next step); empty until then.
export async function GET() {
  return NextResponse.json({ languages: [] });
}
