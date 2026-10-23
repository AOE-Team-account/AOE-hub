"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Markdown } from "./Markdown";
import { BackLink } from "@/components/ui/BackLink";

export interface PolicyViewDoc {
  slug: string;
  title: string;
  version: string;
  updated: string;
  draft: boolean;
  body: string;
  written: "en" | "zh-CN";
  converted: boolean;
  needsTranslation: boolean;
}

// One policy page. English and Chinese are official; Traditional Chinese is
// converted automatically; any other language sees English first, with a
// button that machine-translates it (labelled unofficial, official text one
// click away).
export function PolicyView({ doc }: { doc: PolicyViewDoc }) {
  const { t, lang } = useLanguage();
  const [state, setState] = useState<"idle" | "busy" | "paused" | "error" | "done">("idle");
  const [translated, setTranslated] = useState<{ title: string; text: string } | null>(null);
  const [showOfficial, setShowOfficial] = useState(false);

  async function translate() {
    setState("busy");
    try {
      const res = await fetch("/api/policy-translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: doc.slug, lang }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.status === "ok") { setTranslated({ title: d.title, text: d.text }); setState("done"); setShowOfficial(false); return; }
      setState(res.status === 429 || d.status === "paused" ? "paused" : "error");
    } catch {
      setState("error");
    }
  }

  const unofficial = translated && !showOfficial;
  const shown = unofficial ? translated : { title: doc.title, text: doc.body };

  return (
    <>
    <BackLink label={t("common.back")} />
    <article className="card">
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{shown.title}</h1>
      <p className="tiny" style={{ marginBottom: 12 }}>{t("policy.version", { version: doc.version, date: doc.updated })}</p>

      {doc.draft && <p className="policy-note"><strong>{t("policy.draft")}</strong></p>}
      {doc.converted && <p className="tiny" style={{ marginBottom: 10 }}>{t("policy.converted")}</p>}
      {doc.needsTranslation && !translated && <p className="tiny" style={{ marginBottom: 10 }}>{t("policy.englishOfficial")}</p>}
      {unofficial && <p className="policy-note"><strong>{t("policy.unofficial")}</strong></p>}

      {doc.needsTranslation && (
        <div style={{ marginBottom: 14 }}>
          {!translated && (
            <button type="button" className="btn small" onClick={translate} disabled={state === "busy"}>
              {state === "busy" ? t("policy.translating") : t("policy.translate")}
            </button>
          )}
          {translated && (
            <button type="button" className="btn small" onClick={() => setShowOfficial((v) => !v)}>
              {showOfficial ? t("policy.showTranslation") : t("policy.showOfficial")}
            </button>
          )}
          {state === "paused" && <p className="tiny" style={{ marginTop: 6 }}>{t("policy.paused")}</p>}
          {state === "error" && <p className="tiny" style={{ marginTop: 6 }}>{t("policy.error")}</p>}
        </div>
      )}

      <Markdown text={shown.text} />
    </article>
    </>
  );
}
