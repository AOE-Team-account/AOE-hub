"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";
import type { UiKey } from "@/lib/i18n/strings";

interface PoolRow {
  id: string; provider: string; label: string; hint: string; active: boolean; created_at: string;
  last_check_at: string | null; last_check_ok: boolean | null; last_check_note: string | null;
}
interface FileRow { provider: string; label: string; hint: string }

const SERVICES: { id: string; name: UiKey; help: UiKey }[] = [
  { id: "google", name: "creator.pool.svc.google", help: "creator.pool.help.google" },
  { id: "groq", name: "creator.pool.svc.groq", help: "creator.pool.help.groq" },
  { id: "qwen-intl", name: "creator.pool.svc.qwenIntl", help: "creator.pool.help.qwenIntl" },
  { id: "qwen-cn", name: "creator.pool.svc.qwenCn", help: "creator.pool.help.qwenCn" },
];

// The hub's AI key pool: add keys here instead of in the settings file. A key
// is checked with its company before it is saved, is stored encrypted, and is
// never shown again — only its name and last four characters.
export function KeyPool() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [provider, setProvider] = useState("google");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<Record<string, { ok: boolean; note: string }>>({});
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const nameOf = (id: string) => { const s = SERVICES.find((x) => x.id === id); return s ? t(s.name) : id; };

  const load = useCallback(async () => {
    const res = await fetch("/api/creator/ai-keys");
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setRows(data.keys ?? []); setFileRows(data.fileKeys ?? []); }
    else setError(data?.error ?? t("creator.pool.readFail"));
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch("/api/creator/ai-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data?.error ?? t("creator.didNotWork")); return false; }
    setMessage(body.action === "test" ? (data.ok ? `${t("creator.pool.working")} ${data.note ?? ""}` : data.note) : done);
    await load();
    return true;
  }

  async function testAll() {
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch("/api/creator/ai-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test-all" }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? t("creator.didNotWork"));
    const map: Record<string, { ok: boolean; note: string }> = {};
    for (const r of data.results as { source: string; label: string; hint: string; ok: boolean; note: string }[]) {
      if (r.source === "file") map[`${r.label}|${r.hint}`] = { ok: r.ok, note: r.note };
    }
    setFileStatus(map);
    setCheckedAt(new Date());
    const all = data.results as { ok: boolean }[];
    setMessage(t("creator.pool.checked", { n: all.length, ok: all.filter((r) => r.ok).length }));
    await load();
  }

  const total = rows.length + fileRows.length;
  const working = rows.filter((r) => r.active && r.last_check_ok === true).length + Object.values(fileStatus).filter((s) => s.ok).length;

  return (
    <div className="card">
      <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.pool.title")}</p>
      <p className="muted" style={{ marginBottom: 8 }}>
        {t("creator.pool.summary", { total, file: fileRows.length, added: rows.length })}
        {checkedAt ? ` ${t("creator.pool.workingNow", { n: working, time: checkedAt.toLocaleTimeString() })}` : ` ${t("creator.pool.pressTest")}`}
      </p>
      <Button size="small" disabled={busy || total === 0} onClick={testAll} style={{ marginBottom: 10 }}>{busy ? t("creator.pool.checking") : t("creator.pool.testAll")}</Button>
      <p className="muted" style={{ marginBottom: 10 }}>
        {t("creator.pool.help")}
      </p>

      <div className="row wrap" style={{ gap: 8 }}>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ width: "auto" }}>
          {SERVICES.map((s) => <option key={s.id} value={s.id}>{t(s.name)}</option>)}
        </select>
        <input style={{ width: 200 }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("creator.pool.namePh")} maxLength={60} />
        <input style={{ flex: 1, minWidth: 220 }} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("creator.pool.keyPh")} autoComplete="off" spellCheck={false} />
        <Button variant="primary" disabled={busy || !label.trim() || key.trim().length < 8} onClick={async () => {
          const ok = await act({ action: "add", provider, label, key }, t("creator.pool.added"));
          if (ok) { setKey(""); setLabel(""); }
        }}>{busy ? t("creator.pool.checking") : t("creator.pool.checkAdd")}</Button>
      </div>
      <p className="tiny" style={{ marginTop: 6 }}>{t(SERVICES.find((s) => s.id === provider)!.help)}</p>
      {message && <p className="tiny" style={{ marginTop: 6, color: "var(--accent)" }}>{message}</p>}
      {error && <p className="tiny" style={{ marginTop: 6, color: "#b5471f" }}>{error}</p>}

      <p className="label" style={{ fontWeight: 500, margin: "14px 0 6px" }}>{t("creator.pool.list")}</p>
      {rows.length === 0 && fileRows.length === 0 && <p className="muted">{t("creator.pool.none")}</p>}
      {fileRows.map((r, i) => (
        <div className="row between wrap" key={`f${i}`} style={{ gap: 8, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
          <span><strong>{r.label}</strong> <span className="tiny">· {nameOf(r.provider)} · …{r.hint}</span></span>
          <span className="tiny">
            {fileStatus[`${r.label}|${r.hint}`] ? `${fileStatus[`${r.label}|${r.hint}`].ok ? t("creator.pool.ok") : t("creator.pool.problem")}: ${fileStatus[`${r.label}|${r.hint}`].note} · ` : ""}
            {t("creator.pool.inFile")}
          </span>
        </div>
      ))}
      {rows.map((r) => (
        <div className="row between wrap" key={r.id} style={{ gap: 8, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
          <span>
            <strong>{r.label}</strong> <span className="tiny">· {nameOf(r.provider)} · …{r.hint}{r.active ? "" : ` · ${t("creator.pool.switchedOff")}`}</span>
            <br />
            <span className="tiny">
              {r.last_check_ok === null ? t("creator.pool.notChecked") : `${r.last_check_ok ? t("creator.pool.ok") : t("creator.pool.problem")}: ${r.last_check_note ?? ""} (${r.last_check_at ? new Date(r.last_check_at).toLocaleString() : ""})`}
            </span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <Button size="small" disabled={busy} onClick={() => act({ action: "test", id: r.id }, "")}>{t("creator.pool.test")}</Button>
            <Button size="small" disabled={busy} onClick={() => act({ action: "toggle", id: r.id, active: !r.active }, r.active ? t("creator.pool.nowOff") : t("creator.pool.nowOn"))}>{r.active ? t("creator.pool.switchOff") : t("creator.pool.switchOn")}</Button>
            <Button size="small" variant="danger" disabled={busy} onClick={() => { if (confirm(t("creator.pool.confirmRemove", { label: r.label }))) act({ action: "remove", id: r.id }, t("creator.pool.removed")); }}>{t("creator.remove")}</Button>
          </span>
        </div>
      ))}
    </div>
  );
}
