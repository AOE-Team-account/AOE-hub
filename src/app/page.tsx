"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Logo } from "@/components/brand/Logo";
import { Reveal } from "@/components/ui/Reveal";

export default function HomePage() {
  const { status, hydrated } = useAuth();
  const { dict } = useLanguage();
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
        <p className="tagline">{dict.heroTaglineEyebrow}</p>
        <h1 dangerouslySetInnerHTML={{ __html: dict.heroH1 }} />
        <p>{dict.heroSubhead}</p>
        <div className="landing-cta">
          <button className="btn primary" onClick={() => router.push("/signup")}>
            {dict.heroSignup}
          </button>
          <button className="btn" onClick={() => router.push("/login")}>
            {dict.heroLogin}
          </button>
        </div>
        <p className="tiny">
          <span>{dict.browsePre}</span>{" "}
          <Link href="/files" style={{ color: "var(--accent)" }}>
            {dict.browseLink}
          </Link>
          <span>{dict.browsePost}</span>
        </p>
        <p className="tiny">
          <span>{dict.signupPre}</span> <strong>{dict.signupStrong}</strong>
        </p>
        <Reveal>
          <p className="hero-pullquote">{dict.heroPullquote}</p>
        </Reveal>
        <Reveal>
          <p className="hero-tagline-small">{dict.heroTaglineSmall}</p>
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
        <p className="feature-eyebrow">Experience Board</p>
        <h3 className="feature-title">Real stories, and the philosophy behind them</h3>
        <p className="feature-desc">
          What worked, what didn&apos;t, and what they&apos;d do differently — plus honest reflections on why we
          educate at all, from the Bible, Charlotte Mason{" "}
          <span className="tiny">(a 19th-century educator known for her living-books, nature-study approach)</span>,
          Karl Witte <span className="tiny">(a 19th-century writer known for his early-education philosophy)</span>,
          and everyone here who has their own thoughts to share. This isn&apos;t just the admins&apos; philosophy —
          it&apos;s everybody&apos;s, filed under its own tag so it&apos;s easy to find.
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
        <p className="feature-eyebrow">File Board</p>
        <h3 className="feature-title">Free curriculum, books, cards, games, and printables</h3>
        <p className="feature-desc">Download, use, and remix anything — always at no cost, and always credited back to whoever made it first.</p>
      </Reveal>

      <Reveal className="feature-row">
        <div className="feature-icon-wrap">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="6" cy="7" r="3" />
            <circle cx="18" cy="7" r="3" />
            <circle cx="12" cy="17" r="3" />
            <path d="M8.5 9 10 15M15.5 9 14 15M9 6h6" />
          </svg>
        </div>
        <p className="feature-eyebrow">Groups</p>
        <h3 className="feature-title">Find or start a circle of families</h3>
        <p className="feature-desc">
          Some groups are public and searchable, some are private and invite-only — either way, a real place to talk
          with people on the same path.
        </p>
      </Reveal>

      <div className="hero-bottom-cta">
        <button className="btn primary" onClick={() => router.push("/signup")}>
          {dict.heroSignup}
        </button>
      </div>

      <div className="site-footer">
        <div className="row wrap" style={{ gap: 18, justifyContent: "center" }}>
          <a href="#" className="footer-link">About</a>
          <a href="#" className="footer-link">Contact</a>
          <a href="#" className="footer-link">Privacy Policy</a>
        </div>
        <p className="tiny" style={{ textAlign: "center", marginTop: 10 }}>© AOEhub</p>
      </div>
    </>
  );
}
