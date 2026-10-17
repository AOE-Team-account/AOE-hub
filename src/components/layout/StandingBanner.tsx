"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { contactSentence } from "@/lib/site";

// Tells a signed-in person plainly when their account is restricted or
// suspended, with the end date for a restriction. Nothing is shown to anyone
// else, and nothing about who acted.
export function StandingBanner() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  if (!user) return null;

  let text: string | null = null;
  if (user.accountStatus === "suspended") {
    text = `${t("banner.suspended")} ${contactSentence(t)}`;
  } else if (user.restrictedUntil) {
    const until = new Date(user.restrictedUntil).toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
    text = t("banner.restricted", { date: until });
  }
  if (!text) return null;

  return (
    <div className="banner-wrap">
      <div className="banner-box" role="status">
        <span>{text}</span>
      </div>
    </div>
  );
}
