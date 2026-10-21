"use client";

import { useReport } from "@/contexts/ReportContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

/** "Report this picture" under a member's name; a reviewer looks at it first. */
export function ReportProfilePicture({ userId }: { userId: string }) {
  const { openReport } = useReport();
  const { user } = useAuth();
  const { t } = useLanguage();
  if (user?.id === userId) return null;
  return (
    <button
      type="button"
      className="tiny"
      onClick={() => openReport({ targetType: "profile-picture", targetId: userId })}
      style={{ background: "none", border: 0, padding: 0, color: "inherit", opacity: 0.75, textDecoration: "underline", cursor: "pointer", font: "inherit", fontSize: 12 }}
    >
      {t("report.pictureLink")}
    </button>
  );
}
