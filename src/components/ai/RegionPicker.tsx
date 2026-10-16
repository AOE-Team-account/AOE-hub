"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Region } from "@/lib/types";

// "Where are you using AOEhub from?" Two buttons. It is the member's own
// statement (never checked) and only decides which free-AI-key help is shown.
// With `onChange` it just reports the choice (onboarding saves it with the
// rest); without, it saves straight to the profile (Settings).
export function RegionPicker({ value, onChange, saveNow = false }: { value: Region | null; onChange?: (r: Region) => void; saveNow?: boolean }) {
  const { user, refreshProfile } = useAuth();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(r: Region) {
    setSaved(false);
    setError(null);
    if (saveNow && user) {
      const { error: err } = await createClient().from("profiles").update({ region: r }).eq("id", user.id);
      if (err) return setError("Could not save that. Please try again.");
      await refreshProfile();
      setSaved(true);
    }
    onChange?.(r);
  }

  return (
    <div>
      <div className="seg" role="group" aria-label="Where are you using AOEhub from?" style={{ display: "flex", gap: 8 }}>
        {([["china", "I’m in mainland China"], ["world", "I’m not in mainland China"]] as [Region, string][]).map(([r, label]) => (
          <button key={r} type="button" className={`chip${value === r ? " active" : ""}`} style={{ flex: 1 }} onClick={() => pick(r)}>
            {label}
          </button>
        ))}
      </div>
      {saved && <p className="tiny" style={{ marginTop: 6 }}>Saved. Your AI suggestions now match where you are.</p>}
      {error && <p className="tiny" style={{ marginTop: 6, color: "#b5471f" }}>{error}</p>}
    </div>
  );
}
