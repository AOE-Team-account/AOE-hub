"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import type { ReportTargetType } from "@/lib/types";

interface ReportTarget {
  targetType: ReportTargetType;
  targetId: string;
}

interface ReportContextValue {
  target: ReportTarget | null;
  openReport: (target: ReportTarget) => void;
  closeReport: () => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const { requireAuth } = useAuth();
  const [target, setTarget] = useState<ReportTarget | null>(null);

  const value = useMemo(
    () => ({
      target,
      openReport: (t: ReportTarget) => {
        if (requireAuth()) setTarget(t);
      },
      closeReport: () => setTarget(null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target]
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport() {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReport must be used within ReportProvider");
  return ctx;
}
