"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LanguageCode } from "@/lib/types";
import { UI_DICTIONARIES, type UiDictionary } from "@/lib/i18n/dictionaries";

interface LanguageContextValue {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
  dict: UiDictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "aoehub.lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>("en");

  useEffect(() => {
    // Persisted preference lives client-side only, so it can't be read
    // until after mount (avoids an SSR/client markup mismatch).
    const stored = window.localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored && stored in UI_DICTIONARIES) setLangState(stored);
  }, []);

  function setLang(next: LanguageCode) {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  const value = useMemo(() => ({ lang, setLang, dict: UI_DICTIONARIES[lang] }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
