"use client";

import { useReport } from "@/contexts/ReportContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ReportTargetType } from "@/lib/types";

export function ReportButton({ targetType, targetId }: { targetType: ReportTargetType; targetId: string }) {
  const { openReport } = useReport();
  const { t } = useLanguage();
  return (
    <button
      className="more-btn"
      onClick={(e) => {
        e.stopPropagation();
        openReport({ targetType, targetId });
      }}
      aria-label={t("report.button")}
    >
      ⋯
    </button>
  );
}
