"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export interface KeyHelpRow {
  provider_id: string;
  region: "china" | "world";
  title: string;
  steps: string[];
  note: string | null;
  link_url: string | null;
  active: boolean;
}

// The "get a free API key" instructions members see in sign-up and Settings.
// Sign-up steps at AI companies change often, so they are editable here
// instead of living in the code. One step per line.
export function KeyHelpEditor({ rows }: { rows: KeyHelpRow[] }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [drafts, setDrafts] = useState<Record<string, { steps: string; note: string; active: boolean }>>(
    Object.fromEntries(rows.map((r) => [r.provider_id, { steps: r.steps.join("\n"), note: r.note ?? "", active: r.active }]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(id: string) {
    const d = drafts[id];
    setBusy(id);
    setMessage(null);
    const steps = d.steps.split("\n").map((x) => x.trim()).filter(Boolean);
    const { error } = await createClient().rpc("set_ai_key_help", { p_provider_id: id, p_steps: steps, p_note: d.note, p_active: d.active });
    setBusy(null);
    setMessage(error ? error.message : t("creator.saved"));
    if (!error) router.refresh();
  }

  return (
    <div className="card">
      <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.keyhelp.title")}</p>
      <p className="muted" style={{ marginBottom: 10 }}>
        {t("creator.keyhelp.help")}
      </p>
      {rows.map((r) => {
        const d = drafts[r.provider_id];
        return (
          <div key={r.provider_id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>{r.title} <span className="tiny">({r.region === "china" ? t("creator.keyhelp.china") : t("creator.keyhelp.world")})</span></p>
            <textarea rows={5} value={d.steps} onChange={(e) => setDrafts((x) => ({ ...x, [r.provider_id]: { ...d, steps: e.target.value } }))} />
            <input placeholder={t("creator.keyhelp.notePh")} value={d.note} onChange={(e) => setDrafts((x) => ({ ...x, [r.provider_id]: { ...d, note: e.target.value } }))} style={{ marginTop: 6 }} />
            <label className="check-item" style={{ marginTop: 6 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={d.active} onChange={(e) => setDrafts((x) => ({ ...x, [r.provider_id]: { ...d, active: e.target.checked } }))} />
              <span>{t("creator.keyhelp.show")}</span>
            </label>
            <Button size="small" disabled={busy === r.provider_id} onClick={() => save(r.provider_id)}>{t("common.save")}</Button>
          </div>
        );
      })}
      {message && <p className="tiny" style={{ marginTop: 8 }}>{message}</p>}
    </div>
  );
}
