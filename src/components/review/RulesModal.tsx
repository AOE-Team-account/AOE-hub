"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// The strict rules every reviewer follows (memory doc chat6, "Strict rules for
// reviewers" — a draft the Creator edits). Shown from both panels.
export function RulesButton() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>{t("staff.rules.title")}</Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <p className="title">{t("staff.rules.title")}</p>
        <ol className="muted" style={{ paddingLeft: 18, margin: "8px 0" }}>
          <li>{t("staff.rules.r1")}</li>
          <li>{t("staff.rules.r2")}</li>
          <li>{t("staff.rules.r3")}</li>
          <li>{t("staff.rules.r4")}</li>
          <li>{t("staff.rules.r5")}</li>
          <li>{t("staff.rules.r6")}</li>
          <li>{t("staff.rules.r7")}</li>
        </ol>
        <div className="row"><Button onClick={() => setOpen(false)}>{t("staff.close")}</Button></div>
      </Modal>
    </>
  );
}
