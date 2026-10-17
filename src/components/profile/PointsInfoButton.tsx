"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useLanguage } from "@/contexts/LanguageContext";
import { POINTS } from "@/lib/points";

export function PointsInfoButton() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn small" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>
        {t("points.button")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <p className="title">{t("points.title")}</p>
        <p className="muted" style={{ marginBottom: 8 }}>{t("points.intro")}</p>
        <p className="muted" style={{ marginBottom: 4 }}>• {t("points.view", { n: POINTS.VIEW })}</p>
        <p className="muted" style={{ marginBottom: 4 }}>• {t("points.download", { n: POINTS.DOWNLOAD })}</p>
        <p className="muted" style={{ marginBottom: 4 }}>• {t("points.comment", { n: POINTS.COMMENT_RECEIVED })}</p>
        <p className="muted" style={{ marginBottom: 10 }}>• {t("points.remix", { n: POINTS.REMIX })}</p>
        <p className="tiny">
          {t("points.note")}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => setOpen(false)}>{t("common.gotIt")}</button>
        </div>
      </Modal>
    </>
  );
}
