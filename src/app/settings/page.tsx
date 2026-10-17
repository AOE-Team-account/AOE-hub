"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { THEME_SWATCH_ORDER, TEXT_ZOOM_OPTIONS, type TextZoom } from "@/lib/theme-presets";
import { rich } from "@/lib/i18n/rich";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import { useAuth } from "@/contexts/AuthContext";
import type { UiKey } from "@/lib/i18n/strings";
import { AiKeyForm } from "@/components/ai/AiKeyForm";
import { RegionPicker } from "@/components/ai/RegionPicker";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

const ZOOM_FONT_SIZE: Record<TextZoom, number> = { 0.9: 12, 1: 15, 1.15: 18, 1.3: 21 };

export default function SettingsPage() {
  const { themeKey, setThemeKey, dark, setDark, textZoom, setTextZoom } = useTheme();
  const { lang, setLang, t, languages, machineTranslated } = useLanguage();
  const [notifyOn, setNotifyOn] = useState(true);
  const { status, signOut, user } = useAuth();
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
        <p className="label">{t("settings.appearance")}</p>
        <Segmented
          options={[
            { value: "light", label: t("settings.light") },
            { value: "dark", label: t("settings.dark") },
          ]}
          value={dark ? "dark" : "light"}
          onChange={(v) => setDark(v === "dark")}
        />
        <p className="tiny" style={{ margin: "14px 0 8px", fontWeight: 500 }}>{t("settings.theme")}</p>
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
          {THEME_SWATCH_ORDER.map((sw) => (
            <button
              key={sw.key}
              className={`swatch${themeKey === sw.key ? " active" : ""}`}
              style={{ background: sw.color }}
              title={t(`theme.${sw.key}` as UiKey)}
              onClick={() => setThemeKey(sw.key)}
            />
          ))}
        </div>
        <p className="tiny">{t("settings.themeHint")}</p>
      </section>

      <section className="settings-block">
        <p className="label">{t("settings.textSize")}</p>
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
        <p className="tiny" style={{ marginTop: 6 }}>{t("settings.textSizeHint")}</p>
      </section>

      <section className="settings-block">
        <p className="label">{t("common.language")}</p>
        <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: "auto", maxWidth: 260 }}>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>{l.label}{l.source === "ai" ? " (AI)" : ""}</option>
          ))}
        </select>
        <p className="tiny" style={{ marginTop: 6 }}>{t("settings.languageHint")}</p>
        {machineTranslated && <p className="tiny" style={{ marginTop: 4 }}>{t("common.machineTranslated")}</p>}
      </section>

      {status === "authed" && (
        <section className="settings-block">
          <p className="label">{t("settings.twoStepTitle")}</p>
          <p className="tiny" style={{ marginBottom: 10 }}>{t("settings.twoStepBody")}</p>
          <Link href="/security" className="btn small">{t("settings.twoStepManage")}</Link>
        </section>
      )}

      {status === "authed" && (
        <section className="settings-block">
          <p className="label">{t("settings.aiTitle")}</p>
          <p className="tiny" style={{ marginBottom: 10 }}>{t("settings.aiBody")}</p>
          <p className="label" style={{ marginTop: 14 }}>{t("settings.regionQuestion")}</p>
          <RegionPicker value={user?.region ?? null} saveNow />
          <p className="tiny" style={{ margin: "6px 0 12px" }}>{t("settings.regionHint")}</p>
          <AiKeyForm region={user?.region ?? null} />
        </section>
      )}

      <section className="settings-block">
        <p className="label">{t("settings.notifications")}</p>
        <div className="card row between">
          <p className="muted" style={{ margin: 0 }}>{t("settings.notifyReplies")}</p>
          <Toggle on={notifyOn} onChange={setNotifyOn} label={t("settings.notifyReplies")} />
        </div>
      </section>

      {status === "authed" && (
        <section className="settings-block">
          <p className="label">{t("settings.deleteTitle")}</p>
          <p className="tiny" style={{ marginBottom: 10 }}>{t("settings.deleteBody")}</p>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>{t("settings.deleteTitle")}</Button>
        </section>
      )}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <p className="title">{t("settings.deleteConfirmTitle")}</p>
        <p className="muted">{rich(t("settings.deleteConfirmBody"), { b: (c) => <strong>{c}</strong> })}</p>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoComplete="off" />
        {deleteError && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{deleteError}</p>}
        <div className="row" style={{ gap: 8 }}>
          <Button variant="danger" disabled={deleting || confirmText.trim() !== "DELETE"} onClick={deleteMyAccount}>
            {deleting ? t("settings.deleting") : t("settings.deleteTitle")}
          </Button>
          <Button onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</Button>
        </div>
      </Modal>
    </>
  );
}
