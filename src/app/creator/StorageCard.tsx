"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";
import { formatBytes } from "@/lib/format";

interface State { bytes: number; objects: number; checked_at: string; level: number }

// How full the main R2 bucket is against Cloudflare's free 10 GB.
export function StorageCard() {
  const { t, lang } = useLanguage();
  const [state, setState] = useState<State | null>(null);
  const [free, setFree] = useState(10e9);
  const [emailOn, setEmailOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (d: { state: State | null; free: number; emailOn: boolean }) => { setState(d.state); setFree(d.free); setEmailOn(d.emailOn); };
  const load = useCallback(async () => {
    const res = await fetch("/api/creator/storage");
    if (res.ok) apply(await res.json());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function checkNow() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/creator/storage", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) apply(d);
    else setError(d.error || t("creator.storage.failed"));
  }

  const pct = state ? Math.min(100, Math.round((state.bytes / free) * 100)) : 0;
  const color = !state ? "var(--accent)" : state.bytes >= 10e9 ? "#b5471f" : state.bytes >= 8e9 ? "#c98a1a" : "var(--accent)";

  return (
    <div className="card">
      <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.storage.title")}</p>
      <p className="muted" style={{ marginBottom: 10 }}>{t("creator.storage.help")}</p>
      {state ? (
        <>
          <div style={{ height: 10, background: "var(--border)", borderRadius: 6, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: color }} />
          </div>
          <p style={{ margin: "0 0 4px", fontWeight: 500 }}>
            {t("creator.storage.used", { used: formatBytes(state.bytes), free: formatBytes(free), pct })}
          </p>
          <p className="tiny" style={{ marginBottom: 8 }}>
            {t("creator.storage.checked", { objects: state.objects.toLocaleString(lang), when: new Date(state.checked_at).toLocaleString(lang) })}
          </p>
        </>
      ) : (
        <p className="tiny" style={{ marginBottom: 8 }}>{t("creator.storage.never")}</p>
      )}
      <p className="tiny" style={{ marginBottom: 8 }}>{emailOn ? t("creator.storage.emailOn") : t("creator.storage.emailOff")}</p>
      {error && <p className="tiny" style={{ color: "#b5471f", marginBottom: 8 }}>{error}</p>}
      <Button size="small" disabled={busy} onClick={checkNow}>{busy ? t("creator.storage.checking") : t("creator.storage.checkNow")}</Button>
    </div>
  );
}
