import type { VideoPlatform } from "@/lib/types";

// The six places a "Videos" pick may point to. The hub only links to them.
export const VIDEO_PLATFORMS: { id: VideoPlatform; name: string; hosts: string[] }[] = [
  { id: "youtube", name: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { id: "bilibili", name: "bilibili", hosts: ["bilibili.com", "b23.tv"] },
  { id: "tiktok", name: "TikTok", hosts: ["tiktok.com"] },
  { id: "xiaohongshu", name: "小红书", hosts: ["xiaohongshu.com", "xhslink.com"] },
  { id: "wechat", name: "WeChat", hosts: ["mp.weixin.qq.com", "channels.weixin.qq.com"] },
  { id: "facebook", name: "Facebook", hosts: ["facebook.com", "fb.watch"] },
];

const hostMatches = (host: string, base: string) => host === base || host.endsWith("." + base);

/** Which platform an address belongs to; null when it is none of the six (or is not a plain https address). */
export function platformOf(raw: string): VideoPlatform | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  return VIDEO_PLATFORMS.find((p) => p.hosts.some((h) => hostMatches(host, h)))?.id ?? null;
}

export const platformName = (id: VideoPlatform) => VIDEO_PLATFORMS.find((p) => p.id === id)?.name ?? id;

/** Takes off tracking parts so the same video is never posted twice under different links. */
export function cleanVideoUrl(raw: string): string {
  let u = new URL(raw);
  u.hash = "";
  // Every form of a YouTube address becomes the one standard watch address.
  if (u.hostname === "youtu.be" && u.pathname.length > 1) u = new URL(`https://www.youtube.com/watch?v=${u.pathname.slice(1).split("/")[0]}`);
  else if (u.hostname.endsWith("youtube.com")) u.hostname = "www.youtube.com";
  const keep = u.hostname.endsWith("youtube.com") ? ["v", "list"] : [];
  for (const k of [...u.searchParams.keys()]) if (!keep.includes(k)) u.searchParams.delete(k);
  return u.toString();
}
