// AOEhub's own accounts, shown on the Contact page. An account appears only
// once its address (or its QR code picture in public/social/) is filled in;
// nothing is shown for an empty one, so there are never placeholder links.
export interface SocialAccount {
  id: "instagram" | "wechat" | "bilibili" | "tiktok" | "youtube" | "xiaohongshu";
  name: string;
  /** The account's web address (https only). */
  url?: string;
  /** A QR code picture in public/social/, e.g. "/social/wechat-qr.png" (for WeChat and Instagram). */
  qr?: string;
}

export const SOCIAL_ACCOUNTS: SocialAccount[] = [
  { id: "instagram", name: "Instagram" },
  { id: "wechat", name: "WeChat 微信" },
  { id: "bilibili", name: "bilibili" },
  { id: "tiktok", name: "TikTok" },
  { id: "youtube", name: "YouTube" },
  { id: "xiaohongshu", name: "小红书" },
];

export const shownAccounts = () => SOCIAL_ACCOUNTS.filter((a) => (a.url && /^https:\/\//.test(a.url)) || a.qr);
