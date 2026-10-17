"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";

// A reviewer's notice shown above a post, file or comment. It names the tier
// ("a Watcher", "a Deacon", "the Creator"), never the person.
const TIER: Record<string, UiKey> = {
  watcher: "notice.tier.watcher",
  deacon: "notice.tier.deacon",
  creator: "notice.tier.creator",
};

export function NoticeBox({ notice }: { notice: { tier: string; body: string } | null | undefined }) {
  const { t } = useLanguage();
  if (!notice) return null;
  return (
    <div className="banner-box" role="note" style={{ margin: "0 0 10px", display: "block" }}>
      <strong>{t("notice.from", { tier: t(TIER[notice.tier] ?? "notice.tier.reviewer") })}</strong> {notice.body}
    </div>
  );
}
