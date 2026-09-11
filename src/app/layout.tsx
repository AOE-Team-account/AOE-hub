import type { Metadata } from "next";
import "./globals.css";
import { allFontVariables } from "@/lib/fonts";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ReportProvider } from "@/contexts/ReportContext";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "AOEhub — Alpha Omega Education",
  description:
    "A free education hub for homeschool, unschool, and school families: real experience, shared philosophy, and free curriculum.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={allFontVariables}>
      <body>
        <ThemeProvider>
          <LanguageProvider>
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
