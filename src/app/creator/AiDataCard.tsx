"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";

interface Provider { id: string; label: string; model: string; restingUntil: string | null; lastError: string | null; lastOkAt: string | null }
interface Status {
  documents: number;
  pendingDocuments: number;
  pendingNext: number | null;
  liveModel: string;
  nextModel: string | null;
  providers: Provider[];
  googleConfigured: boolean;
  googleKeyCount: number;
  groqConfigured: boolean;
  suggestedModel: string;
}

// Shows which AI answers questions and which embedding model searches use,
// and walks the Creator through changing the embedding model safely: build
// the new data next to the old, check it is complete, switch, then clean up.
export function AiDataCard() {
  const { t, lang } = useLanguage();
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/creator/knowledge/embedding");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setS(data);
    else setError(data?.error ?? t("creator.ai.readFail"));
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(action: string, extra: Record<string, string> = {}) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/creator/knowledge/embedding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? t("creator.didNotWork"));
    if (action === "cleanup") setMessage(t("creator.ai.removedOld", { n: data.removedChunks }));
    await load();
  }

  async function build() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      for (let i = 0; i < 400; i++) {
        const res = await fetch("/api/creator/knowledge/index", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(data?.error ?? t("creator.ai.indexFail")); break; }
        await load();
        if (data.rateLimited) {
          const secs = Number(data.retryAfterSec) || 0;
          setMessage(
            secs > 900
              ? t("creator.ai.dailyLimit", { hours: Math.ceil(secs / 3600) })
              : t("creator.ai.slowDown")
          );
          break;
        }
        if (data.done) { setMessage(t("creator.ai.upToDate")); break; }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <p className="muted">{error ?? t("common.loading")}</p>;
  const nextReady = s.nextModel && (s.pendingNext ?? 0) === 0;

  return (
    <div className="card">
      <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>{t("creator.ai.title")}</p>
      <p className="tiny" style={{ marginBottom: 6 }}>{t("creator.ai.help", { n: s.googleKeyCount })}</p>
      {s.providers.map((p) => (
        <p className="tiny" key={p.id} style={{ margin: "0 0 2px" }}>
          <strong>{p.label}</strong> ({p.model}):{" "}
          {p.restingUntil ? t("creator.ai.resting", { time: new Date(p.restingUntil).toLocaleTimeString(lang) }) + (p.lastError ? ` — ${p.lastError}` : "") : p.lastOkAt ? t("creator.ai.workingLast", { time: new Date(p.lastOkAt).toLocaleString(lang) }) : t("creator.ai.ready")}
        </p>
      ))}
      {!s.googleConfigured && <p className="tiny" style={{ color: "#b5471f" }}>{t("creator.ai.noGoogle")}</p>}
      {!s.groqConfigured && <p className="tiny">{t("creator.ai.noGroq")}</p>}

      <p style={{ fontWeight: 500, fontSize: 14, margin: "14px 0 6px" }}>{t("creator.ai.searchData")}</p>
      <p className="muted" style={{ margin: "0 0 4px" }}>
        {t("creator.ai.searchingWith", { model: s.liveModel, docs: s.documents, waiting: s.pendingDocuments })}
      </p>
      {s.nextModel ? (
        <p className="muted" style={{ margin: "0 0 8px" }}>
          {t("creator.ai.building", { model: s.nextModel, done: s.documents - (s.pendingNext ?? 0), docs: s.documents })}
        </p>
      ) : (
        <p className="tiny" style={{ margin: "0 0 8px" }}>{t("creator.ai.nothingBuilding")}</p>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <Button size="small" disabled={busy} onClick={build}>{busy ? t("staff.working") : t("creator.ai.updateIndex")}</Button>
        {!s.nextModel && s.liveModel !== s.suggestedModel && (
          <Button size="small" variant="primary" disabled={busy || !s.googleConfigured} onClick={async () => { await act("start-next"); await build(); }}>
            {t("creator.ai.startReembed", { model: s.suggestedModel })}
          </Button>
        )}
        {s.nextModel && (
          <>
            <Button size="small" variant="primary" disabled={busy || !nextReady} onClick={() => act("switch")}>{t("creator.ai.switchTo", { model: s.nextModel })}</Button>
            <Button size="small" disabled={busy} onClick={() => act("cancel-next")}>{t("common.cancel")}</Button>
          </>
        )}
        {!s.nextModel && s.liveModel === s.suggestedModel && (
          <Button size="small" disabled={busy} onClick={() => { if (window.confirm(t("creator.ai.confirmCleanup"))) act("cleanup"); }}>
            {t("creator.ai.cleanup")}
          </Button>
        )}
      </div>
      {message && <p className="tiny" style={{ marginTop: 8 }}>{message}</p>}
      {error && <p className="tiny" style={{ marginTop: 8, color: "#b5471f" }}>{error}</p>}
    </div>
  );
}
