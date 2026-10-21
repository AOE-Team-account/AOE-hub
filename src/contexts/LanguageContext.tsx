"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LANGUAGE_NAMES,
  STATIC_LANGUAGES,
  STATIC_TABLES,
  isStaticLanguage,
  textDirection,
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
  /** Re-reads the list of languages the AI has added (after one is finished). */
  refreshLanguages: () => Promise<void>;
  /** True when the current language is machine-translated, not written by a person. */
  machineTranslated: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "aoehub.lang";
const COOKIE = "aoehub.lang";

const STATIC_OPTIONS: LanguageOption[] = STATIC_LANGUAGES.map((code) => ({ code, label: LANGUAGE_NAMES[code], source: "reviewed" }));

export function LanguageProvider({
  children,
  initialLang,
  initialStrings,
}: {
  children: ReactNode;
  initialLang: string;
  /** The strings of an AI-added initial language, loaded on the server so the first paint is already in it. */
  initialStrings?: Record<string, string> | null;
}) {
  const router = useRouter();
  const [lang, setLangState] = useState<string>(initialLang);
  const [extra, setExtra] = useState<LanguageOption[]>([]);
  const [aiTables, setAiTables] = useState<Record<string, Partial<Record<UiKey, string>>>>(
    initialStrings && !isStaticLanguage(initialLang) ? { [initialLang]: initialStrings as Partial<Record<UiKey, string>> } : {}
  );

  // Languages added by AI, and (when the current one is such a language) its
  // strings. Both come from the server; English shows until they arrive.
  const refreshLanguages = useCallback(async () => {
    try {
      const r = await fetch("/api/i18n/languages", { cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      if (d?.languages) setExtra((d.languages as LanguageOption[]).filter((l) => !isStaticLanguage(l.code)));
    } catch {
      /* the list just stays as it was */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshLanguages();
  }, [refreshLanguages]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = textDirection(lang);
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
    // Text drawn by the server (page descriptions, panel intros) follows the cookie: draw it again.
    router.refresh();
  }, [router]);

  const languages = useMemo(() => [...STATIC_OPTIONS, ...extra], [extra]);

  const value = useMemo<LanguageContextValue>(() => {
    const table = isStaticLanguage(lang) ? STATIC_TABLES[lang] : aiTables[lang];
    return {
      lang,
      setLang,
      t: (key, params) => translateKey(table, key, params),
      languages,
      refreshLanguages,
      machineTranslated: !isStaticLanguage(lang),
    };
  }, [lang, setLang, aiTables, languages, refreshLanguages]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
