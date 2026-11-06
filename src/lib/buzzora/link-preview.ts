import "server-only";
import { safeFetchText, pageToText } from "./safe-fetch";
import { VIDEO_PLATFORMS, cleanVideoUrl, platformOf } from "./platforms";
import { cleanText } from "./text";
import type { VideoPlatform } from "@/lib/types";

// For the paste-a-link tool: works out which of the six platforms an address
// belongs to and, where the platform allows it, the video's title and channel.
// Only the platforms' own addresses are ever fetched. If a platform refuses
// (login walls on 小红书, WeChat and Facebook are common), the staff member types the title.

export interface LinkPreview { platform: VideoPlatform; url: string; title: string; author: string }

const allowHost = (host: string) => VIDEO_PLATFORMS.some((p) => p.hosts.some((h) => host === h || host.endsWith("." + h)));

export async function previewVideoLink(raw: string): Promise<LinkPreview | null> {
  const platform = platformOf(raw);
  if (!platform) return null;
  const url = cleanVideoUrl(raw);
  let title = "", author = "";
  try {
    if (platform === "youtube" || platform === "tiktok") {
      const endpoint = platform === "youtube" ? "https://www.youtube.com/oembed" : "https://www.tiktok.com/oembed";
      const got = await safeFetchText(`${endpoint}?url=${encodeURIComponent(url)}${platform === "youtube" ? "&format=json" : ""}`, allowHost, { accept: "application/json", maxBytes: 100_000 });
      if (got.status === 200) { const j = JSON.parse(got.text) as { title?: string; author_name?: string }; title = j.title ?? ""; author = j.author_name ?? ""; }
    } else {
      const got = await safeFetchText(url, allowHost, { maxBytes: 600_000 });
      if (got.status === 200) { const p = pageToText(got.text, 200); title = p.title; author = p.siteName ?? ""; }
    }
  } catch { /* leave blank: the staff member types it */ }
  return { platform, url, title: cleanText(title, 140), author: cleanText(author, 60) };
}
