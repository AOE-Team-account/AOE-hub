import { NextResponse } from "next/server";
import { checkStorage } from "@/lib/storage/watch";

export const runtime = "nodejs";
export const maxDuration = 120;

// Run once a day by the scheduled-jobs workflow (Authorization: Bearer CRON_SECRET).
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await checkStorage();
    return NextResponse.json({ bytes: r.bytes, objects: r.objects, level: r.level, alerted: r.alerted });
  } catch (err) {
    console.error("Storage check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The storage check failed." }, { status: 500 });
  }
}
