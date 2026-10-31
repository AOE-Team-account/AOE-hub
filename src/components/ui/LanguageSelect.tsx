"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const ADD = "__add__";

/**
 * The language menu: the three written languages, any the AI has added, and
 * "Add another language…", which asks for a name and has the AI translate the
 * hub into it (a minute or so, with progress), then switches to it.
 */
export function LanguageSelect({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang, t, languages, refreshLanguages } = useLanguage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);

  async function add() {
    if (running.current || !name.trim()) return;
    running.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const first = await fetch("/api/i18n/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json());
      if (!first.ok) {
        setMessage(first.error ?? t("lang.failed"));
        if (first.code) {
          setLang(first.code);
          close();
        }
        return;
      }
      let language = first.language as { code: string; nativeName: string; status: string; done: number; total: number };
      let failures = 0;
      while (language.status === "building") {
        setProgress({ name: language.nativeName, pct: Math.round((language.done / Math.max(1, language.total)) * 100) });
        const step = await fetch("/api/i18n/add", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lang: language.code }),
        })
          .then((r) => r.json())
          .catch(() => ({ ok: false }));
        if (step.ok) {
          language = step.language;
          failures = 0;
        } else {
          failures++;
          if (failures > 8) {
            setMessage(t("lang.failed"));
            return;
          }
          setMessage(t("lang.retrying"));
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
      if (language.status === "ready") {
        await refreshLanguages();
        setLang(language.code);
        close();
      } else {
        setMessage(t("lang.failed"));
      }
    } finally {
      running.current = false;
      setBusy(false);
      setProgress(null);
    }
  }

  function close() {
    setOpen(false);
    setName("");
    setMessage(null);
  }

  return (
    <>
      <select
        value={lang}
        onChange={(e) => (e.target.value === ADD ? setOpen(true) : setLang(e.target.value))}
        aria-label={t("common.language")}
        style={style}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>{l.label}{l.source === "ai" ? " (AI)" : ""}</option>
        ))}
        <option value={ADD}>{t("lang.add")}</option>
      </select>
      <Modal open={open} onClose={() => !busy && close()}>
        <p role="heading" aria-level={2} className="title">{t("lang.addTitle")}</p>
        <p className="muted" style={{ marginBottom: 10 }}>{t("lang.addHelp")}</p>
        <input
          value={name}
          placeholder={t("lang.addPlaceholder")}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          maxLength={60}
        />
        {progress && <p className="tiny" style={{ marginTop: 8 }}>{t("lang.working", { name: progress.name, pct: progress.pct })}</p>}
        {message && <p className="tiny" style={{ marginTop: 8, color: "#b5471f" }}>{message}</p>}
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Button variant="primary" onClick={add} disabled={busy || !name.trim()}>{t("lang.addGo")}</Button>
          <Button onClick={close} disabled={busy}>{t("common.cancel")}</Button>
        </div>
      </Modal>
    </>
  );
}
