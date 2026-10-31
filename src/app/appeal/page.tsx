"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { reasonText } from "@/lib/i18n/reasons";
import { Button } from "@/components/ui/Button";
import { BackLink } from "@/components/ui/BackLink";
import type { UiKey } from "@/lib/i18n/strings";
import { CONTACT_EMAIL } from "@/lib/site";

interface Standing {
  warnings: { id: string; reason: string; level: string; created_at: string; item_kind: string; title: string }[];
  restriction: { id: string; ends_at: string } | null;
  appeals: { id: string; kind: string; subject_id: string | null; status: string; decision_note: string | null; created_at: string; message: string }[];
}

const STATUS_KEY: Record<string, UiKey> = {
  open: "appeal.status.open",
  "recommend-overturn": "appeal.status.open",
  upheld: "appeal.status.upheld",
  overturned: "appeal.status.overturned",
};

// A member's own record: the warnings and restriction they can appeal, and the
// appeals they already sent. An appeal goes to a reviewer other than the one
// who made the decision (a Creator decision goes to the Creator).
export default function AppealPage() {
  const ready = useRequireAuthPage("/");
  const { t, lang } = useLanguage();
  const [s, setS] = useState<Standing | null>(null);
  const [open, setOpen] = useState<string | null>(null); // "warning:<id>" | "restriction:<id>" | "other"
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("my_standing");
    setS(data as Standing);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  async function send() {
    if (!open) return;
    const [kind, subject] = open.split(":");
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().rpc("file_appeal", { p_kind: kind, p_subject: subject ?? null, p_message: text });
    setBusy(false);
    if (err) return setError(/already/i.test(err.message) ? t("appeal.already") : /several|wait/i.test(err.message) ? t("appeal.slow") : /10 to 1,500/.test(err.message) ? t("appeal.tooShort") : t("appeal.failed"));
    setOpen(null);
    setText("");
    setMessage(t("appeal.sent"));
    await load();
  }

  const openFor = (kind: string, id: string | null) => s?.appeals.find((a) => a.kind === kind && a.subject_id === id && (a.status === "open" || a.status === "recommend-overturn"));

  const form = (key: string) =>
    open === key && (
      <div style={{ marginTop: 8 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder={t("appeal.placeholder")} />
        {error && <p className="tiny" style={{ color: "#b5471f" }}>{error}</p>}
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <Button variant="primary" size="small" disabled={busy || text.trim().length < 10} onClick={send}>{busy ? t("common.saving") : t("appeal.send")}</Button>
          <Button size="small" onClick={() => { setOpen(null); setError(null); }}>{t("common.cancel")}</Button>
        </div>
      </div>
    );

  return (
    <>
      <BackLink href="/profile" label={t("common.back")} />
      <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("appeal.title")}</p>
      <p className="muted" style={{ marginBottom: 12 }}>{t("appeal.intro")}</p>
      {message && <p className="tiny" style={{ color: "var(--accent)", marginBottom: 8 }}>{message}</p>}
      {!s && <p className="muted">{t("common.loading")}</p>}

      {s?.restriction && (
        <div className="card">
          <p style={{ fontWeight: 500, margin: "0 0 2px" }}>{t("appeal.restriction")}</p>
          <p className="tiny" style={{ margin: "0 0 6px" }}>{t("banner.restricted", { date: new Date(s.restriction.ends_at).toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" }) })}</p>
          {openFor("restriction", s.restriction.id) ? <p className="tiny">{t("appeal.waiting")}</p> : open !== `restriction:${s.restriction.id}` && (
            <Button size="small" onClick={() => { setOpen(`restriction:${s.restriction!.id}`); setText(""); setError(null); }}>{t("appeal.this")}</Button>
          )}
          {form(`restriction:${s.restriction.id}`)}
        </div>
      )}

      <p className="label" style={{ fontWeight: 500, margin: "14px 0 8px" }}>{t("appeal.warnings")}</p>
      {s && s.warnings.length === 0 && <p className="muted">{t("appeal.noWarnings")}</p>}
      {s?.warnings.map((w) => (
        <div className="card" key={w.id}>
          <p style={{ fontWeight: 500, margin: "0 0 2px" }}>{reasonText(t, w.reason)} <span className="tiny">· {t(`staff.level.${w.level}` as UiKey)}</span></p>
          <p className="tiny" style={{ margin: "0 0 6px" }}>{new Date(w.created_at).toLocaleDateString(lang)}{w.title ? ` · ${w.title}` : ""}</p>
          {openFor("warning", w.id) ? <p className="tiny">{t("appeal.waiting")}</p> : open !== `warning:${w.id}` && (
            <Button size="small" onClick={() => { setOpen(`warning:${w.id}`); setText(""); setError(null); }}>{t("appeal.this")}</Button>
          )}
          {form(`warning:${w.id}`)}
        </div>
      ))}

      <div className="card" style={{ marginTop: 10 }}>
        <p style={{ fontWeight: 500, margin: "0 0 2px" }}>{t("appeal.otherTitle")}</p>
        <p className="tiny" style={{ margin: "0 0 6px" }}>{t("appeal.otherHelp")}</p>
        {open !== "other" && <Button size="small" onClick={() => { setOpen("other"); setText(""); setError(null); }}>{t("appeal.writeOther")}</Button>}
        {form("other")}
      </div>

      {s && s.appeals.length > 0 && (
        <>
          <p className="label" style={{ fontWeight: 500, margin: "14px 0 8px" }}>{t("appeal.yours")}</p>
          {s.appeals.map((a) => (
            <div className="card" key={a.id}>
              <p style={{ margin: "0 0 2px", fontWeight: 500 }}>{t(STATUS_KEY[a.status] ?? "appeal.status.open")} <span className="tiny">· {new Date(a.created_at).toLocaleDateString(lang)}</span></p>
              <p className="tiny" style={{ margin: 0 }}>{a.message}</p>
              {a.decision_note && a.status !== "open" && a.status !== "recommend-overturn" && <p className="tiny" style={{ margin: "4px 0 0" }}>{t("appeal.note", { note: a.decision_note })}</p>}
            </div>
          ))}
        </>
      )}
      {CONTACT_EMAIL && <p className="tiny" style={{ marginTop: 14 }}>{t("appeal.suspendedHelp", { email: CONTACT_EMAIL })}</p>}
    </>
  );
}
