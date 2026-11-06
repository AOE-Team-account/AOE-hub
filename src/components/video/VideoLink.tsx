"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { platformName } from "@/lib/buzzora/platforms";
import type { VideoPlatform } from "@/lib/types";

const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

/** The link of a "Videos" post. Only a link: the video stays on its own platform. */
export function VideoLink({ url, platform, aiPicked }: { url: string; platform: VideoPlatform; aiPicked: boolean }) {
  const { t } = useLanguage();
  const name = platformName(platform);
  // Only ever link to a plain https address (defence in depth: the database is trusted, but a link is cheap to check).
  if (!/^https:\/\//i.test(url)) return null;
  return (
    <div style={{ margin: "6px 0 4px" }}>
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="btn small primary" onClick={stop}>
        {t("video.watchOn", { platform: name })}
      </a>
      <p className="tiny" style={{ margin: "6px 0 0" }}>{t("video.linkOnly", { platform: name })}</p>
      {aiPicked && <p className="tiny" style={{ margin: "2px 0 0" }}>{t("video.aiLabel")}</p>}
      {platform === "youtube" && aiPicked && (
        <p className="tiny" style={{ margin: "2px 0 0" }}>
          {t("video.youtubeApi")}{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" onClick={stop} style={{ color: "var(--accent-link)" }}>{t("video.youtubeTerms")}</a>
          {" · "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" onClick={stop} style={{ color: "var(--accent-link)" }}>{t("video.googlePrivacy")}</a>
        </p>
      )}
    </div>
  );
}
