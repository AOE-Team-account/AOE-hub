import { createServiceRoleClient } from "@/lib/supabase/service";
import { getR2Object } from "@/lib/storage/r2";

export const runtime = "nodejs";

// A member's profile picture, for anyone who can open their profile. The
// address carries a version (?v=…) that changes with the picture, so it can be
// remembered for a long time.
export async function GET(_request: Request, { params }: RouteContext<"/api/avatar/[userId]">) {
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return new Response("Not found", { status: 404 });
  const { data } = await createServiceRoleClient().from("profiles").select("avatar_path, account_status").eq("id", userId).maybeSingle();
  if (!data?.avatar_path || data.account_status !== "active") return new Response("Not found", { status: 404 });
  try {
    const obj = await getR2Object(data.avatar_path as string);
    if (!obj.Body) return new Response("Not found", { status: 404 });
    const body = (obj.Body as unknown as { transformToWebStream: () => ReadableStream }).transformToWebStream();
    return new Response(body, {
      headers: { "content-type": "image/webp", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
