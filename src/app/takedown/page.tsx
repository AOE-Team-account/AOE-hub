"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";
import { BackLink } from "@/components/ui/BackLink";
import { CONTACT_EMAIL } from "@/lib/site";

export default function TakedownPage() {
  return (
    <Suspense fallback={null}>
      <TakedownForm />
    </Suspense>
  );
}

// A copyright holder reports a work that was posted without permission. No
// account is needed. The notice goes to the Creator and, when it points at a
// post or file here, to the reviewers who handle it.
function TakedownForm() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const [f, setF] = useState({ name: "", email: "", address: "", rightsHolder: "", original: "", url: params.get("url") ?? "", signature: "" });
  const [goodFaith, setGoodFaith] = useState(false);
  const [accurate, setAccurate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/takedown", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, goodFaith, accurate }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return setDone(true);
    setError(d.code === "slow" ? t("takedown.slow") : d.code === "invalid" ? t("takedown.invalid") : t("takedown.failed"));
  }

  if (done) {
    return (
      <>
        <BackLink href="/" label={t("common.back")} />
        <div className="card">
          <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("takedown.thanksTitle")}</p>
          <p className="muted">{t("takedown.thanks")}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <BackLink href="/" label={t("common.back")} />
      <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("takedown.title")}</p>
      <p className="muted" style={{ marginBottom: 12 }}>{t("takedown.intro")}</p>
      <form onSubmit={submit}>
        <label className="field-label" style={{ marginTop: 0 }}>{t("takedown.name")} {t("common.required")}</label>
        <input value={f.name} onChange={set("name")} required maxLength={200} autoComplete="name" />
        <label className="field-label">{t("takedown.email")} {t("common.required")}</label>
        <input type="email" value={f.email} onChange={set("email")} required maxLength={200} autoComplete="email" />
        <label className="field-label">{t("takedown.address")} {t("common.optional")}</label>
        <textarea value={f.address} onChange={set("address")} maxLength={500} style={{ minHeight: 50 }} />
        <label className="field-label">{t("takedown.rightsHolder")} {t("common.optional")}</label>
        <input value={f.rightsHolder} onChange={set("rightsHolder")} maxLength={200} />
        <label className="field-label">{t("takedown.original")} {t("common.required")}</label>
        <textarea value={f.original} onChange={set("original")} required maxLength={2000} placeholder={t("takedown.originalPh")} />
        <label className="field-label">{t("takedown.url")} {t("common.required")}</label>
        <input value={f.url} onChange={set("url")} required maxLength={500} placeholder="https://…" inputMode="url" />
        <label className="check-item" style={{ alignItems: "flex-start", marginTop: 14 }}>
          <input type="checkbox" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
          <span>{t("takedown.goodFaith")}</span>
        </label>
        <label className="check-item" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={accurate} onChange={(e) => setAccurate(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
          <span>{t("takedown.accurate")}</span>
        </label>
        <label className="field-label">{t("takedown.signature")} {t("common.required")}</label>
        <input value={f.signature} onChange={set("signature")} required maxLength={200} placeholder={t("takedown.signaturePh")} />
        {error && <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>{error}</p>}
        <Button variant="primary" type="submit" style={{ width: "100%", marginTop: 14 }} disabled={busy || !goodFaith || !accurate}>
          {busy ? t("takedown.sending") : t("takedown.send")}
        </Button>
        {CONTACT_EMAIL && <p className="tiny" style={{ marginTop: 10 }}>{t("takedown.orEmail", { email: CONTACT_EMAIL })}</p>}
      </form>
    </>
  );
}
