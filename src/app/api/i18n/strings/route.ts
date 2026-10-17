import { NextResponse } from "next/server";

export const runtime = "nodejs";

// The interface strings of an AI-added language (next step); none yet.
export async function GET() {
  return NextResponse.json({ strings: {} });
}
