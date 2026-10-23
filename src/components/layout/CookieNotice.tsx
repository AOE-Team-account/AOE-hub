"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { rich } from "@/lib/i18n/rich";

const KEY = "aoehub.cookieNotice";

// An information notice, not a consent form: the hub only uses the cookies and
// browser storage it needs to work (sign-in, language, look), and no
// advertising or tracking. Shown once per browser until "Got it" is pressed.
export function CookieNotice() {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = window.localStorage.getItem(KEY) === "1"; } catch { /* storage blocked: show it each visit */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!seen) setShow(true);
  }, []);

  if (!show) return null;
  function close() {
    try { window.localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  }

  return (
    <div className="cookie-notice" role="region" aria-label={t("cookie.label")}>
      <p style={{ margin: 0 }}>
        {rich(t("cookie.body"), { a: (c) => <Link href="/policy/privacy" style={{ color: "var(--accent)" }}>{c}</Link> })}
      </p>
      <button type="button" className="btn small primary" onClick={close}>{t("common.gotIt")}</button>
    </div>
  );
}
