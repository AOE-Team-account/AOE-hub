"use client";

import { useReport } from "@/contexts/ReportContext";
import type { ReportTargetType } from "@/lib/types";

export function ReportButton({ targetType, targetId }: { targetType: ReportTargetType; targetId: string }) {
  const { openReport } = useReport();
  return (
    <button
      className="more-btn"
      onClick={(e) => {
        e.stopPropagation();
        openReport({ targetType, targetId });
      }}
      aria-label="Report"
    >
      ⋯
    </button>
  );
}
