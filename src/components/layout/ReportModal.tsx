"use client";

import { useState } from "react";
import { useReport } from "@/contexts/ReportContext";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import type { ReportReason } from "@/lib/types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "scam", label: "Scam or asking for money" },
  { value: "off-topic", label: "Off-topic / not education related" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "paywalled", label: "Paywalled or costs money" },
  { value: "copyright", label: "Copyright — not their work" },
  { value: "other", label: "Something else" },
];

export function ReportModal() {
  const { target, closeReport } = useReport();
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason>("scam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDetails("");
    setReason("scam");
    setError(null);
  }

  async function submit() {
    // ReportContext only opens this modal via requireAuth(), so `user`
    // should already be set — this is a defensive backstop, not the gate.
    if (!target || !user) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("reports").insert({
      target_type: target.targetType,
      target_id: target.targetId,
      reason,
      details: details.trim() || null,
      reported_by: user.id,
    });
    setBusy(false);
    if (insertError) {
      setError("Couldn't submit the report. Please try again.");
      return;
    }
    reset();
    closeReport();
  }

  return (
    <Modal open={Boolean(target)} onClose={closeReport}>
      <p className="title">Report this</p>
      <p className="muted" style={{ marginBottom: 10 }}>
        What&apos;s the issue?
      </p>
      <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} style={{ marginBottom: 10 }}>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        placeholder="Add any details (optional)"
        style={{ minHeight: 60 }}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      {error && <p className="tiny" style={{ color: "#b5471f", marginTop: 6 }}>{error}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit report"}
        </button>
        <button className="btn" onClick={closeReport}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
