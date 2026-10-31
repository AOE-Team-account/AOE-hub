"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { TopBar } from "./TopBar";
import { PrimaryTabs } from "./PrimaryTabs";
import { SignInModal } from "./SignInModal";
import { ReportModal } from "./ReportModal";
import { RoleMessageModal } from "./RoleMessageModal";
import { LanguageSync } from "./LanguageSync";
import { StandingBanner } from "./StandingBanner";
import { Footer } from "./Footer";
import { CookieNotice } from "./CookieNotice";
import { PolicyGate } from "./PolicyGate";
import { A11yFixes } from "./A11yFixes";
import { AiFab } from "@/components/ai/AiFab";

export function AppShell({ children }: { children: ReactNode }) {
  const { textZoom } = useTheme();
  const { t } = useLanguage();

  return (
    <div id="app-root" className="app">
      {/* Text-size scaling is scoped to this wrapper only — see the note in
          globals.css on why it must not reach the AI FAB / modals below. */}
      <a href="#main-content" className="skip-link">{t("a11y.skip")}</a>
      <div style={{ zoom: textZoom }}>
        <TopBar />
        <PrimaryTabs />
        <StandingBanner />
        <main id="main-content" className="shell page-body" tabIndex={-1}>{children}</main>
        <div className="shell"><Footer /></div>
      </div>

      <AiFab />
      <SignInModal />
      <ReportModal />
      <RoleMessageModal />
      <CookieNotice />
      <PolicyGate />
      <A11yFixes />
      <LanguageSync />
    </div>
  );
}
