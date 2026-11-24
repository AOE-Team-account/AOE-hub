import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { uploadToR2, deleteFromR2 } from "@/lib/storage/r2";
import { rateLimitedShared } from "@/lib/ai/server/rate-limit";

export const runtime = "nodejs";

const MAX_INPUT = 5 * 1024 * 1024;

// A member's own profile picture. The upload is decoded and written out again
// as a small square WebP, so nothing but picture data (no hidden code, no
// camera location) survives. Anyone who can open the profile can see it.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (await rateLimitedShared(`avatar:${user.id}`, 10, 10 * 60_000)) return NextResponse.json({ error: "Please wait a few minutes.", code: "slow" }, { status: 429 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file.", code: "bad" }, { status: 400 });
  if (file.size > MAX_INPUT) return NextResponse.json({ error: "Too big.", code: "too-big" }, { status: 413 });

  let out: Buffer;
  try {
    out = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error" })
      .rotate()
      .resize(320, 320, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "That does not look like a picture.", code: "not-image" }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  const { data: profile } = await svc.from("profiles").select("avatar_path, account_status").eq("id", user.id).single();
  if (!profile || profile.account_status !== "active") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const key = `avatars/${user.id}/${randomUUID()}.webp`;
  await uploadToR2(key, out, "image/webp");
  const { error } = await svc.from("profiles").update({ avatar_path: key }).eq("id", user.id);
  if (error) {
    try { await deleteFromR2(key); } catch { /* nothing more to do */ }
    return NextResponse.json({ error: "Could not save the picture." }, { status: 500 });
  }
  if (profile.avatar_path) {
    try { await deleteFromR2(profile.avatar_path as string); } catch (err) { console.error("Could not delete the old picture:", err); }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const svc = createServiceRoleClient();
  const { data: profile } = await svc.from("profiles").select("avatar_path").eq("id", user.id).single();
  await svc.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (profile?.avatar_path) {
    try { await deleteFromR2(profile.avatar_path as string); } catch (err) { console.error("Could not delete the picture:", err); }
  }
  return NextResponse.json({ ok: true });
}
