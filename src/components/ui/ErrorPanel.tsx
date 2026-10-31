"use client";

import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";
import { useLanguage } from "@/contexts/LanguageContext";

// The friendly page shown for "page not found" and for unexpected errors.
// Deliberately shows no technical detail: error messages can contain things
// a visitor must never see.
export function ErrorPanel({ kind, onRetry }: { kind: "notFound" | "error"; onRetry?: () => void }) {
  const { t } = useLanguage();
  const notFound = kind === "notFound";
  return (
    <div className="landing-hero" style={{ paddingTop: "3rem" }}>
      <p className="tagline">{notFound ? "404" : "AOEhub"}</p>
      <h1>{t(notFound ? "errorPage.notFoundTitle" : "errorPage.title")}</h1>
      <p>{t(notFound ? "errorPage.notFoundBody" : "errorPage.body")}</p>
      {!notFound && CONTACT_EMAIL && <p className="tiny">{t("errorPage.contact", { email: CONTACT_EMAIL })}</p>}
      <div className="landing-cta">
        {onRetry && (
          <button type="button" className="btn primary" onClick={onRetry}>
            {t("errorPage.retry")}
          </button>
        )}
        <Link href="/" className={onRetry ? "btn" : "btn primary"}>
          {t("errorPage.home")}
        </Link>
      </div>
      {notFound && (
        <p className="tiny">
          <Link href="/experience" style={{ color: "var(--accent)" }}>{t("errorPage.browseExperience")}</Link>
          {" · "}
          <Link href="/files" style={{ color: "var(--accent)" }}>{t("errorPage.browseFiles")}</Link>
        </p>
      )}
    </div>
  );
}
