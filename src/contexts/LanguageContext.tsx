"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LANGUAGE_NAMES,
  STATIC_LANGUAGES,
  STATIC_TABLES,
  isStaticLanguage,
  translateKey,
  type TParams,
  type UiKey,
} from "@/lib/i18n/strings";

export interface LanguageOption {
  code: string;
  label: string;
  /** "reviewed" = written and checked by a person; "ai" = machine-translated. */
  source: "reviewed" | "ai";
}

interface LanguageContextValue {
  lang: string;
  setLang: (lang: string) => void;
  /** Interface text in the current language (English where a string is not available yet). */
  t: (key: UiKey, params?: TParams) => string;
  languages: LanguageOption[];
  /** True when the current language is machine-translated, not written by a person. */
  machineTranslated: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "aoehub.lang";
const COOKIE = "aoehub.lang";

const STATIC_OPTIONS: LanguageOption[] = STATIC_LANGUAGES.map((code) => ({ code, label: LANGUAGE_NAMES[code], source: "reviewed" }));

export function LanguageProvider({ children, initialLang }: { children: ReactNode; initialLang: string }) {
  const [lang, setLangState] = useState<string>(initialLang);
  const [extra, setExtra] = useState<LanguageOption[]>([]);
  const [aiTables, setAiTables] = useState<Record<string, Partial<Record<UiKey, string>>>>({});

  // Languages added by AI, and (when the current one is such a language) its
  // strings. Both come from the server; English shows until they arrive.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/i18n/languages")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.languages) setExtra((d.languages as LanguageOption[]).filter((l) => !isStaticLanguage(l.code)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (isStaticLanguage(lang) || aiTables[lang]) return;
    let cancelled = false;
    fetch(`/api/i18n/strings?lang=${encodeURIComponent(lang)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.strings) setAiTables((all) => ({ ...all, [lang]: d.strings }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lang, aiTables]);

  const setLang = useCallback((next: string) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage can be blocked; the cookie below is what the server reads */
    }
    document.cookie = `${COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, []);

  const languages = useMemo(() => [...STATIC_OPTIONS, ...extra], [extra]);

  const value = useMemo<LanguageContextValue>(() => {
    const table = isStaticLanguage(lang) ? STATIC_TABLES[lang] : aiTables[lang];
    return {
      lang,
      setLang,
      t: (key, params) => translateKey(table, key, params),
      languages,
      machineTranslated: !isStaticLanguage(lang),
    };
  }, [lang, setLang, aiTables, languages]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
