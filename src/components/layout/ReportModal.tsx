"use client";

import { useState } from "react";
import { useReport } from "@/contexts/ReportContext";
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
  const [reason, setReason] = useState<ReportReason>("scam");
  const [details, setDetails] = useState("");

  function submit() {
    // Phase 1: no backend yet — this is where a real report would be
    // created (see src/lib/data/admin.ts for where it'd surface).
    setDetails("");
    setReason("scam");
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
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" onClick={submit}>
          Submit report
        </button>
        <button className="btn" onClick={closeReport}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
