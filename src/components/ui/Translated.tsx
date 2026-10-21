"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_NAMES, isStaticLanguage } from "@/lib/i18n/strings";
import { requestTranslation, peek, toggleOriginal, useShowOriginal, type ContentResult } from "@/lib/i18n/content-client";
import { guessScript, looksEnglish } from "@/lib/translate/detect";

type Tag = "p" | "span" | "div";

function languageLabel(code: string, ui: string): string {
  if (isStaticLanguage(code)) return LANGUAGE_NAMES[code];
  try {
    return new Intl.DisplayNames([ui], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Text written by a member, shown in the reader's language when it was
 * written in another. Nothing shows while it works (the original is there
 * first); when it is already in the reader's language nothing is added at all.
 * Several fields of one item share one "Show original" switch; only the field
 * with `note` draws the "Translated from …" line.
 */
export function Translated({
  type, id, field, text, as: Tag = "p", className, style, note = false, noteWhenPaused = false,
}: {
  type: "experience-post" | "file" | "comment" | "notice" | "notification" | "appeal";
  id: string;
  field: string;
  text: string;
  as?: Tag;
  className?: string;
  style?: React.CSSProperties;
  note?: boolean;
  noteWhenPaused?: boolean;
}) {
  const { lang, t } = useLanguage();
  const req = { type, id, field };
  const [result, setResult] = useState<ContentResult | undefined>(() => peek(lang, req, text));
  const showOriginal = useShowOriginal(`${type}:${id}`);

  useEffect(() => {
    // English text read in English needs no call at all.
    if (lang === "en" && guessScript(text) === "latin" && looksEnglish(text)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult({ text: null, source: "en", status: "same" });
      return;
    }
    const known = peek(lang, { type, id, field }, text);
    if (known) { setResult(known); return; }
    setResult(undefined);
    let cancelled = false;
    requestTranslation(lang, { type, id, field }, text).then((r) => { if (!cancelled) setResult(r); });
    return () => { cancelled = true; };
  }, [lang, type, id, field, text]);

  const translated = result?.status === "translated" && result.text ? result.text : null;
  const shown = translated && !showOriginal ? translated : text;
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); };

  return (
    <>
      <Tag className={className} style={style}>{shown}</Tag>
      {note && translated && (
        <p className="tiny" style={{ margin: "2px 0 8px" }}>
          {t("translate.from", { language: result?.source ? languageLabel(result.source, lang) : "…" })}
          {" · "}
          <button
            type="button"
            onClick={(e) => { stop(e); toggleOriginal(`${type}:${id}`); }}
            style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit" }}
          >
            {showOriginal ? t("translate.showTranslation") : t("translate.showOriginal")}
          </button>
        </p>
      )}
      {note && noteWhenPaused && result?.status === "paused" && <p className="tiny" style={{ margin: "2px 0 8px" }}>{t("translate.paused")}</p>}
    </>
  );
}
