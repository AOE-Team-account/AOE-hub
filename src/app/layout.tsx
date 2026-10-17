import type { Metadata } from "next";
import "./globals.css";
import { allFontVariables } from "@/lib/fonts";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ReportProvider } from "@/contexts/ReportContext";
import { AppShell } from "@/components/layout/AppShell";
import { getRequestLanguage } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "AOEhub — Alpha Omega Education",
  description:
    "A free education hub for homeschool, unschool, and school families: real experience, shared philosophy, and free curriculum.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The visitor's language is decided on the server (saved choice, else their
  // browser's), so the first page they see is already in it.
  const { lang } = await getRequestLanguage();
  return (
    <html lang={lang} className={allFontVariables}>
      <body>
        <ThemeProvider>
          <LanguageProvider initialLang={lang}>
            <AuthProvider>
              <ReportProvider>
                <AppShell>{children}</AppShell>
              </ReportProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
