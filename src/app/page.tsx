"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Logo } from "@/components/brand/Logo";
import { Reveal } from "@/components/ui/Reveal";
import { rich } from "@/lib/i18n/rich";

export default function HomePage() {
  const { status, hydrated } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  // Only redirect an already-authed visitor who lands here directly (e.g. a
  // stale bookmark to "/"). Waits for `hydrated` (see AuthContext) so a hard
  // refresh while actually signed in doesn't flash the guest landing page.
  useEffect(() => {
    if (!hydrated) return;
    if (status === "authed") router.replace("/experience");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (status === "authed") {
    return null;
  }

  return (
    <>
      <div className="landing-hero">
        <Logo />
        <p className="tagline">{t("landing.eyebrow")}</p>
        <h1 dangerouslySetInnerHTML={{ __html: t("landing.h1") }} />
        <p>{t("landing.subhead")}</p>
        <div className="landing-cta">
          <button className="btn primary" onClick={() => router.push("/signup")}>
            {t("landing.signupFree")}
          </button>
          <button className="btn" onClick={() => router.push("/login")}>
            {t("landing.logIn")}
          </button>
        </div>
        <p className="tiny">
          <span>{t("landing.browsePre")}</span>{" "}
          <Link href="/files" style={{ color: "var(--accent)" }}>
            {t("landing.browseLink")}
          </Link>
          <span>{t("landing.browsePost")}</span>
        </p>
        <p className="tiny">
          <span>{t("landing.signupPre")}</span> <strong>{t("landing.signupStrong")}</strong>
        </p>
        <Reveal>
          <p className="hero-pullquote">{t("landing.pullquote")}</p>
        </Reveal>
        <Reveal>
          <p className="hero-tagline-small">{t("landing.taglineSmall")}</p>
        </Reveal>
        <Reveal>
          <p className="hero-tagline-small" style={{ marginTop: 2 }}>{t("landing.marketplaceNote")}</p>
        </Reveal>
      </div>

      <Reveal className="feature-row">
        <div className="feature-icon-wrap">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="4" width="13" height="9" rx="3" />
            <path d="M6 13l-1 3 4-2" />
            <rect x="8" y="11" width="13" height="9" rx="3" />
            <path d="M18 20l1 3-4-2" />
          </svg>
        </div>
        <p className="feature-eyebrow">{t("landing.expEyebrow")}</p>
        <h3 className="feature-title">{t("landing.expTitle")}</h3>
        <p className="feature-desc">
          {rich(t("landing.expDesc"), { note: (c) => <span className="tiny">{c}</span> })}
        </p>
      </Reveal>

      <Reveal className="feature-row">
        <div className="feature-icon-wrap">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M4 19h16" />
          </svg>
        </div>
        <p className="feature-eyebrow">{t("landing.fileEyebrow")}</p>
        <h3 className="feature-title">{t("landing.fileTitle")}</h3>
        <p className="feature-desc">{t("landing.fileDesc")}</p>
      </Reveal>

      <div className="hero-bottom-cta">
        <button className="btn primary" onClick={() => router.push("/signup")}>
          {t("landing.signupFree")}
        </button>
      </div>

      <div className="site-footer">
        <div className="row wrap" style={{ gap: 18, justifyContent: "center" }}>
          <a href="#" className="footer-link">{t("footer.about")}</a>
          <a href="#" className="footer-link">{t("footer.contact")}</a>
          <a href="#" className="footer-link">{t("footer.privacy")}</a>
        </div>
        <p className="tiny" style={{ textAlign: "center", marginTop: 10 }}>© AOEhub</p>
      </div>
    </>
  );
}
