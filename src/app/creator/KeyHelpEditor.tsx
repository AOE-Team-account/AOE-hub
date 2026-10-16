"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    setMessage(error ? error.message : "Saved.");
    if (!error) router.refresh();
  }

  return (
    <div className="card">
      <p className="title" style={{ marginBottom: 4 }}>Free AI key instructions</p>
      <p className="muted" style={{ marginBottom: 10 }}>
        What members see under “Get free API instructions”. Check each against the company&apos;s own site before launch; the steps change.
        One step per line.
      </p>
      {rows.map((r) => {
        const d = drafts[r.provider_id];
        return (
          <div key={r.provider_id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>{r.title} <span className="tiny">({r.region === "china" ? "mainland China" : "elsewhere"})</span></p>
            <textarea rows={5} value={d.steps} onChange={(e) => setDrafts((x) => ({ ...x, [r.provider_id]: { ...d, steps: e.target.value } }))} />
            <input placeholder="Note shown under the steps" value={d.note} onChange={(e) => setDrafts((x) => ({ ...x, [r.provider_id]: { ...d, note: e.target.value } }))} style={{ marginTop: 6 }} />
            <label className="check-item" style={{ marginTop: 6 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={d.active} onChange={(e) => setDrafts((x) => ({ ...x, [r.provider_id]: { ...d, active: e.target.checked } }))} />
              <span>Show this to members</span>
            </label>
            <Button size="small" disabled={busy === r.provider_id} onClick={() => save(r.provider_id)}>Save</Button>
          </div>
        );
      })}
      {message && <p className="tiny" style={{ marginTop: 8 }}>{message}</p>}
    </div>
  );
}
