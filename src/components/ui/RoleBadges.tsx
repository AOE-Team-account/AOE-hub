"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";

// The only role markers anyone can ever see: A (Answerer) and V (Verified).
// Watchers, Deacons and the Creator have no badge at all (anonymity rule).
const BADGES: Record<string, { letter: string; label: UiKey; tint: string; text: string }> = {
  answerer: {
    letter: "A",
    label: "role.answerer",
    tint: "#DDEFD9",
    text: "#2E6B2A",
  },
  verified: {
    letter: "V",
    label: "role.verified",
    tint: "#FBEBC4",
    text: "#7A5A0E",
  },
};

export function RoleBadges({ roles }: { roles?: string[] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<string | null>(null);
  const shown = (roles ?? []).filter((r) => BADGES[r]);
  if (shown.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", position: "relative" }}>
      {shown.map((r) => (
        <button
          key={r}
          type="button"
          aria-label={t(BADGES[r].label)}
          title={t(BADGES[r].label)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(open === r ? null : r);
          }}
          style={{
            width: 18, height: 18, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer",
            background: BADGES[r].tint, color: BADGES[r].text, fontSize: 11, fontWeight: 700, lineHeight: "18px",
          }}
        >
          {BADGES[r].letter}
        </button>
      ))}
      {open && (
        <span className="tiny" style={{ marginLeft: 6, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px" }}>
          {t(BADGES[open].label)}
        </span>
      )}
    </span>
  );
}
