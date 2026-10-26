"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { TwoStepPanel } from "@/components/security/TwoStepPanel";
import { BackLink } from "@/components/ui/BackLink";
import { useLanguage } from "@/contexts/LanguageContext";

function SecurityContent() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const ready = useRequireAuthPage("/experience");
  const next = params.get("next");
  // Only ever return to one of the panel pages (never an arbitrary address).
  const safeNext = next === "/mod" || next === "/creator" || next === "/creator/unlock" ? next : null;
  if (!ready) return null;
  return (
    <>
      <BackLink href="/settings" label={t("twoStep.back")} />
      <p className="title" style={{ marginBottom: 6 }}>{t("twoStep.title")}</p>
      <div className="card">
        <TwoStepPanel
          onVerified={() => {
            // A fresh page load, not a soft navigation: the panel page must be
            // asked again now that this session has passed two-step (a cached
            // "needs two-step" answer would send the person straight back here).
            if (safeNext) window.location.assign(safeNext);
          }}
        />
      </div>
    </>
  );
}

export default function SecurityPage() {
  return (
    <Suspense fallback={null}>
      <SecurityContent />
    </Suspense>
  );
}
