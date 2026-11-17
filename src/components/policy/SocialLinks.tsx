"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { shownAccounts } from "@/lib/social";

/** AOEhub's social accounts on the Contact page: links, and QR codes for WeChat and Instagram. */
export function SocialLinks() {
  const { t } = useLanguage();
  const accounts = shownAccounts();
  if (accounts.length === 0) return null;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <p role="heading" aria-level={2} className="title">{t("contact.followTitle")}</p>
      <div className="row wrap" style={{ gap: 16, alignItems: "flex-start" }}>
        {accounts.map((a) => (
          <div key={a.id} style={{ textAlign: "center", minWidth: 120 }}>
            {a.qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.qr} alt={t("contact.qrAlt", { name: a.name })} width={120} height={120} style={{ display: "block", margin: "0 auto 6px", borderRadius: 8, background: "#fff" }} />
            )}
            {a.url ? (
              <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-link)" }}>{a.name} ↗</a>
            ) : (
              <span className="tiny">{t("contact.scanToFollow", { name: a.name })}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
