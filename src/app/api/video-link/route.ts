import { NextResponse } from "next/server";
import { requireBuzzStaff } from "@/lib/buzzora/guard";
import { ensureSystemUser } from "@/lib/buzzora/system-user";
import { previewVideoLink } from "@/lib/buzzora/link-preview";
import { cleanText } from "@/lib/buzzora/text";
import { platformName } from "@/lib/buzzora/platforms";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { rateLimited } from "@/lib/ai/server/rate-limit";

export const runtime = "nodejs";

// The paste-a-link tool for the Creator and Watchers. Works for all six platforms:
//   { url, preview: true }                 -> which platform, and the title if the platform shares it
//   { url, title, note }                   -> posts the link as AOEhub on the Experience Board (tag "Videos")
// Only a link is stored. The video stays on its own platform.
export async function POST(request: Request) {
  const guard = await requireBuzzStaff();
  if (!guard.ok) return guard.response;
  if (rateLimited(`video-link:${guard.userId}`, 40, 60 * 60_000)) return NextResponse.json({ error: "Too many links this hour." }, { status: 429 });
  const b = (await request.json().catch(() => null)) as { url?: unknown; preview?: unknown; title?: unknown; note?: unknown } | null;
  const preview = await previewVideoLink(String(b?.url ?? ""));
  if (!preview) return NextResponse.json({ error: "That is not an https link to YouTube, bilibili, TikTok, 小红书, WeChat or Facebook." }, { status: 400 });
  if (b?.preview) return NextResponse.json(preview);

  const title = cleanText(b?.title, 140) || preview.title;
  if (title.length < 3) return NextResponse.json({ error: "Please type a title for the video." }, { status: 400 });
  const note = cleanText(b?.note, 400) || `A video on ${platformName(preview.platform)}.`;
  const { data, error } = await createServiceRoleClient().from("experience_posts").insert({
    author_id: await ensureSystemUser(), board: "experience", category: "videos", is_ai: false, posted_by: guard.userId,
    link_url: preview.url, link_platform: preview.platform, title, body: preview.author ? `${note}\n\nBy: ${preview.author}` : note,
  }).select("id").single();
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "That video has already been posted." : "Could not save the post." }, { status: error.message.match(/duplicate|unique/i) ? 409 : 500 });
  return NextResponse.json({ id: data.id });
}
