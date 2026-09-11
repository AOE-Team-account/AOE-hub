"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { TopBar } from "./TopBar";
import { PrimaryTabs } from "./PrimaryTabs";
import { SignInModal } from "./SignInModal";
import { ReportModal } from "./ReportModal";
import { AiFab } from "@/components/ai/AiFab";

export function AppShell({ children }: { children: ReactNode }) {
  const { textZoom } = useTheme();

  return (
    <div id="app-root" className="app">
      {/* Text-size scaling is scoped to this wrapper only — see the note in
          globals.css on why it must not reach the AI FAB / modals below. */}
      <div style={{ zoom: textZoom }}>
        <TopBar />
        <PrimaryTabs />
        <div className="shell page-body">{children}</div>
      </div>

      <AiFab />
      <SignInModal />
      <ReportModal />
    </div>
  );
}
