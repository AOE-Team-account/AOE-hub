"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import type { BuzzSource } from "@/lib/types";

/** The sources of a Buzzora post, as links to the original pages. */
export function BuzzSources({ sources }: { sources: BuzzSource[] }) {
  const { t } = useLanguage();
  const safe = sources.filter((s) => /^https:\/\//i.test(s.url));
  if (safe.length === 0) return null;
  return (
    <div style={{ margin: "6px 0 4px" }}>
      <p className="tiny" style={{ margin: "0 0 2px", fontWeight: 600 }}>{t("buzz.sources")}</p>
      {safe.map((s) => (
        <p key={s.url} className="tiny" style={{ margin: "0 0 2px" }}>
          {s.publisher}{s.published ? ` · ${s.published}` : ""} —{" "}
          <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()} style={{ color: "var(--accent-link)" }}>
            {t("buzz.readSource")}
          </a>
        </p>
      ))}
    </div>
  );
}
