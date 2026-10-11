"use client";

import { useState } from "react";

// The only role markers anyone can ever see: A (Answerer) and V (Verified).
// Watchers, Deacons and the Creator have no badge at all (anonymity rule).
const BADGES: Record<string, { letter: string; label: string; tint: string; text: string }> = {
  answerer: {
    letter: "A",
    label: "Answerer — their answers are carefully chosen, and their posts and comments are pinned to the top.",
    tint: "#DDEFD9",
    text: "#2E6B2A",
  },
  verified: {
    letter: "V",
    label: "Verified — the hub's Creator agrees with this person's ideas. Their comments are highlighted.",
    tint: "#FBEBC4",
    text: "#7A5A0E",
  },
};

export function RoleBadges({ roles }: { roles?: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = (roles ?? []).filter((r) => BADGES[r]);
  if (shown.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", position: "relative" }}>
      {shown.map((r) => (
        <button
          key={r}
          type="button"
          aria-label={BADGES[r].label}
          title={BADGES[r].label}
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
          {BADGES[open].label}
        </span>
      )}
    </span>
  );
}
