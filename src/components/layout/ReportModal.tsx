"use client";

import { useState } from "react";
import { useReport } from "@/contexts/ReportContext";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";
import type { ReportReason } from "@/lib/types";

const REASONS: { value: ReportReason; label: UiKey }[] = [
  { value: "scam", label: "report.reason.scam" },
  { value: "off-topic", label: "report.reason.offTopic" },
  { value: "inappropriate", label: "report.reason.inappropriate" },
  { value: "paywalled", label: "report.reason.paywalled" },
  { value: "copyright", label: "report.reason.copyright" },
  { value: "other", label: "report.reason.other" },
];

export function ReportModal() {
  const { target, closeReport } = useReport();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [reason, setReason] = useState<ReportReason>("scam");
  const [details, setDetails] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPicture = target?.targetType === "profile-picture";

  function reset() {
    setDetails("");
    setUrgent(false);
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
      reason: isPicture ? "inappropriate" : reason,
      details: details.trim() || null,
      reported_by: user.id,
      urgent,
    });
    setBusy(false);
    if (insertError) {
      setError(t("report.error"));
      return;
    }
    reset();
    closeReport();
  }

  return (
    <Modal open={Boolean(target)} onClose={closeReport}>
      <p role="heading" aria-level={2} className="title">{isPicture ? t("report.pictureTitle") : t("report.title")}</p>
      <p className="muted" style={{ marginBottom: 10 }}>
        {isPicture ? t("report.pictureHelp") : t("report.whatIssue")}
      </p>
      {!isPicture && (
        <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} style={{ marginBottom: 10 }}>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {t(r.label)}
            </option>
          ))}
        </select>
      )}
      <textarea
        placeholder={t("report.detailsPlaceholder")}
        style={{ minHeight: 60 }}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      {!isPicture && reason === "copyright" && (
        <p className="tiny" style={{ marginTop: 6 }}>
          <a href={`/takedown?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`} style={{ color: "var(--accent-link)" }}>{t("report.copyrightOwner")}</a>
        </p>
      )}
      <label className="check-item" style={{ alignItems: "flex-start", marginTop: 8 }}>
        <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
        <span>{t("report.urgent")}</span>
      </label>
      {urgent && <p className="tiny" style={{ marginTop: 2 }}>{t("report.urgentNote")}</p>}
      {error && <p className="tiny" style={{ color: "#b5471f", marginTop: 6 }}>{error}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy} onClick={submit}>
          {busy ? t("report.submitting") : t("report.submit")}
        </button>
        <button className="btn" onClick={closeReport}>
          {t("common.cancel")}
        </button>
      </div>
    </Modal>
  );
}
