"use client";

import { useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * A password box with an eye button that shows or hides what was typed.
 * Takes the usual input props; `style` applies to the whole box (spacing),
 * so it can sit where a plain input sat.
 */
export function PasswordInput({ style, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "style"> & { style?: CSSProperties }) {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  return (
    <div style={{ position: "relative", ...style }}>
      <input {...props} type={shown ? "text" : "password"} style={{ paddingRight: 42 }} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t("common.hidePassword") : t("common.showPassword")}
        title={shown ? t("common.hidePassword") : t("common.showPassword")}
        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, padding: 6, cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center" }}
      >
        {shown ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.5 10.5 0 0 1 12 20c-6.5 0-10-8-10-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.7 9.7 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
