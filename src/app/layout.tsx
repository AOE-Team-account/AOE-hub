import type { Metadata } from "next";
import "./globals.css";
import { allFontVariables } from "@/lib/fonts";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ReportProvider } from "@/contexts/ReportContext";
import { AppShell } from "@/components/layout/AppShell";
import { getRequestLanguage } from "@/lib/i18n/server";
import { isStaticLanguage, textDirection } from "@/lib/i18n/strings";
import { getUiStrings } from "@/lib/translate/ui-languages";
import { isPrivateSite } from "@/lib/site-private";

// On the test site (SITE_PRIVATE) every page tells search engines not to list it.
export function generateMetadata(): Metadata {
  return {
    title: "AOEhub — Alpha Omega Education",
    description:
      "A free education hub for homeschool, unschool, and school families: real experience, shared philosophy, and free curriculum.",
    ...(isPrivateSite() ? { robots: { index: false, follow: false, nocache: true } } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The visitor's language is decided on the server (saved choice, else their
  // browser's), so the first page they see is already in it.
  const { lang } = await getRequestLanguage();
  const initialStrings = isStaticLanguage(lang) ? null : await getUiStrings(lang).catch(() => null);
  return (
    <html lang={lang} dir={textDirection(lang)} className={allFontVariables}>
      <body>
        <ThemeProvider>
          <LanguageProvider initialLang={lang} initialStrings={initialStrings}>
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
