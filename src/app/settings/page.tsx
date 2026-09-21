"use client";

import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { THEME_SWATCH_ORDER, TEXT_ZOOM_OPTIONS, type TextZoom } from "@/lib/theme-presets";
import { LANGUAGE_LABELS, LANGUAGE_ORDER } from "@/lib/i18n/dictionaries";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import type { LanguageCode } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { AiKeyForm } from "@/components/ai/AiKeyForm";

const ZOOM_FONT_SIZE: Record<TextZoom, number> = { 0.9: 12, 1: 15, 1.15: 18, 1.3: 21 };

export default function SettingsPage() {
  const { themeKey, setThemeKey, dark, setDark, textZoom, setTextZoom } = useTheme();
  const { lang, setLang } = useLanguage();
  const [notifyOn, setNotifyOn] = useState(true);
  const { status } = useAuth();

  return (
    <>
      <section className="settings-block">
        <p className="label">Appearance</p>
        <Segmented
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          value={dark ? "dark" : "light"}
          onChange={(v) => setDark(v === "dark")}
        />
        <p className="tiny" style={{ margin: "14px 0 8px", fontWeight: 500 }}>Theme</p>
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
          {THEME_SWATCH_ORDER.map((t) => (
            <button
              key={t.key}
              className={`swatch${themeKey === t.key ? " active" : ""}`}
              style={{ background: t.color }}
              title={t.label}
              onClick={() => setThemeKey(t.key)}
            />
          ))}
        </div>
        <p className="tiny">Hover any swatch for its name.</p>
      </section>

      <section className="settings-block">
        <p className="label">Text size</p>
        <div className="seg">
          {TEXT_ZOOM_OPTIONS.map((z) => (
            <button
              key={z}
              className={textZoom === z ? "active" : ""}
              style={{ fontSize: ZOOM_FONT_SIZE[z] }}
              onClick={() => setTextZoom(z)}
            >
              A
            </button>
          ))}
        </div>
        <p className="tiny" style={{ marginTop: 6 }}>Makes everything on the hub bigger — text, buttons, spacing.</p>
      </section>

      <section className="settings-block">
        <p className="label">Language</p>
        <select value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)} style={{ width: "auto", maxWidth: 260 }}>
          {LANGUAGE_ORDER.map((code) => (
            <option key={code} value={code}>{LANGUAGE_LABELS[code]}</option>
          ))}
        </select>
        <p className="tiny" style={{ marginTop: 6 }}>
          Post titles and descriptions are shown in your chosen language when available. Downloaded files are not
          translated.
        </p>
      </section>

      {status === "authed" && (
        <section className="settings-block">
          <p className="label">AI assistant</p>
          <p className="tiny" style={{ marginBottom: 10 }}>
            The assistant uses the hub&apos;s own AI by default. If you have your own AI API key you can use that instead — it
            may answer better than ours.
          </p>
          <AiKeyForm />
        </section>
      )}

      <section className="settings-block">
        <p className="label">Notifications</p>
        <div className="card row between">
          <p className="muted" style={{ margin: 0 }}>Notify me about replies and comments</p>
          <Toggle on={notifyOn} onChange={setNotifyOn} label="Notify me about replies and comments" />
        </div>
      </section>
    </>
  );
}
