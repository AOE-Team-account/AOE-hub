"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { POLICY_NAME_KEYS, POLICY_SLUGS } from "@/lib/policies/slugs";
import { CONTACT_EMAIL } from "@/lib/site";

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="site-footer">
      <nav aria-label={t("footer.label")}>
        {POLICY_SLUGS.map((slug) => (
          <Link key={slug} href={`/policy/${slug}`}>{t(POLICY_NAME_KEYS[slug])}</Link>
        ))}
        {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
      </nav>
      <p style={{ margin: "6px 0 0" }}>{t("footer.line")}</p>
    </footer>
  );
}
