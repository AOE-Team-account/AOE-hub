import { NextResponse } from "next/server";
import { requireCreator } from "@/lib/ai/server/creator-guard";
import { checkStorage, readStorageState, FREE_ALLOWANCE_BYTES } from "@/lib/storage/watch";
import { isAlertEmailConfigured } from "@/lib/email/alert";

export const runtime = "nodejs";
export const maxDuration = 120;

// The Creator panel's "Storage" card: the last measurement, and "Check now".
export async function GET() {
  const guard = await requireCreator();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ state: await readStorageState(), free: FREE_ALLOWANCE_BYTES, emailOn: isAlertEmailConfigured });
}

export async function POST() {
  const guard = await requireCreator();
  if (!guard.ok) return guard.response;
  try {
    const r = await checkStorage();
    return NextResponse.json({ state: { bytes: r.bytes, objects: r.objects, checked_at: r.checked_at, level: r.level }, free: FREE_ALLOWANCE_BYTES, emailOn: isAlertEmailConfigured });
  } catch (err) {
    console.error("Storage check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The storage check failed." }, { status: 500 });
  }
}
