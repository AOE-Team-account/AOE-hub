"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { THEME_SWATCH_ORDER, TEXT_ZOOM_OPTIONS, type TextZoom } from "@/lib/theme-presets";
import { LANGUAGE_LABELS, LANGUAGE_ORDER } from "@/lib/i18n/dictionaries";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import type { LanguageCode } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { AiKeyForm } from "@/components/ai/AiKeyForm";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

const ZOOM_FONT_SIZE: Record<TextZoom, number> = { 0.9: 12, 1: 15, 1.15: 18, 1.3: 21 };

export default function SettingsPage() {
  const { themeKey, setThemeKey, dark, setDark, textZoom, setTextZoom } = useTheme();
  const { lang, setLang } = useLanguage();
  const [notifyOn, setNotifyOn] = useState(true);
  const { status, signOut } = useAuth();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteMyAccount() {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await createClient().rpc("delete_my_account");
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    await signOut();
    router.push("/");
  }

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

      {status === "authed" && (
        <section className="settings-block">
          <p className="label">Delete my account</p>
          <p className="tiny" style={{ marginBottom: 10 }}>
            Your account is switched off and your posts, files and comments are hidden right away. After 30 days
            everything is erased for good. Until then, only the hub&apos;s Creator can restore it.
          </p>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete my account</Button>
        </section>
      )}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <p className="title">Delete your account?</p>
        <p className="muted">
          You will be signed out and your content disappears from the hub. Type <strong>DELETE</strong> to confirm.
        </p>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoComplete="off" />
        {deleteError && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{deleteError}</p>}
        <div className="row" style={{ gap: 8 }}>
          <Button variant="danger" disabled={deleting || confirmText.trim() !== "DELETE"} onClick={deleteMyAccount}>
            {deleting ? "Deleting…" : "Delete my account"}
          </Button>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
        </div>
      </Modal>
    </>
  );
}
