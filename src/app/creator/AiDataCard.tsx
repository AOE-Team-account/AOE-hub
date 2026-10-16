"use client";

import { useCallback, useEffect, useState } from "react";
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
  groqConfigured: boolean;
  suggestedModel: string;
}

// Shows which AI answers questions and which embedding model searches use,
// and walks the Creator through changing the embedding model safely: build
// the new data next to the old, check it is complete, switch, then clean up.
export function AiDataCard() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/creator/knowledge/embedding");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setS(data);
    else setError(data?.error ?? "Could not read the AI status.");
  }, []);

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
    if (!res.ok) return setError(data?.error ?? "That did not work.");
    if (action === "cleanup") setMessage(`Removed ${data.removedChunks} old pieces of data.`);
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
        if (!res.ok) { setError(data?.error ?? "Indexing failed."); break; }
        await load();
        if (data.rateLimited) { setMessage("The AI company asked us to slow down. Press the button again in a few minutes; nothing is lost."); break; }
        if (data.done) { setMessage("Everything is up to date."); break; }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <p className="muted">{error ?? "Loading…"}</p>;
  const nextReady = s.nextModel && (s.pendingNext ?? 0) === 0;

  return (
    <div className="card">
      <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>The hub&apos;s AI</p>
      <p className="tiny" style={{ marginBottom: 6 }}>Answers and translation use Gemini first, and Groq when Gemini is full. It returns to Gemini by itself after resting.</p>
      {s.providers.map((p) => (
        <p className="tiny" key={p.id} style={{ margin: "0 0 2px" }}>
          <strong>{p.label}</strong> ({p.model}):{" "}
          {p.restingUntil ? `resting until ${new Date(p.restingUntil).toLocaleTimeString()}${p.lastError ? ` — ${p.lastError}` : ""}` : p.lastOkAt ? `working (last answer ${new Date(p.lastOkAt).toLocaleString()})` : "ready"}
        </p>
      ))}
      {!s.googleConfigured && <p className="tiny" style={{ color: "#b5471f" }}>GOOGLE_AI_API_KEY is not set in .env.local, so the hub is using the local development model.</p>}
      {!s.groqConfigured && <p className="tiny">No GROQ_API_KEY set: there is no backup when Gemini is full.</p>}

      <p style={{ fontWeight: 500, fontSize: 14, margin: "14px 0 6px" }}>Search data (embeddings)</p>
      <p className="muted" style={{ margin: "0 0 4px" }}>
        Searching with: <strong>{s.liveModel}</strong> · {s.documents} documents · {s.pendingDocuments} waiting
      </p>
      {s.nextModel ? (
        <p className="muted" style={{ margin: "0 0 8px" }}>
          Building alongside: <strong>{s.nextModel}</strong> · {s.documents - (s.pendingNext ?? 0)} of {s.documents} done
        </p>
      ) : (
        <p className="tiny" style={{ margin: "0 0 8px" }}>Nothing else is being built.</p>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <Button size="small" disabled={busy} onClick={build}>{busy ? "Working…" : "Update index"}</Button>
        {!s.nextModel && s.liveModel !== s.suggestedModel && (
          <Button size="small" variant="primary" disabled={busy || !s.googleConfigured} onClick={async () => { await act("start-next"); await build(); }}>
            Start re-embedding with Google ({s.suggestedModel})
          </Button>
        )}
        {s.nextModel && (
          <>
            <Button size="small" variant="primary" disabled={busy || !nextReady} onClick={() => act("switch")}>Switch searches to {s.nextModel}</Button>
            <Button size="small" disabled={busy} onClick={() => act("cancel-next")}>Cancel</Button>
          </>
        )}
        {!s.nextModel && s.liveModel === s.suggestedModel && (
          <Button size="small" disabled={busy} onClick={() => { if (window.confirm("Delete the old search data from the previous model? Do this only after checking the AI answers well.")) act("cleanup"); }}>
            Clean up old data
          </Button>
        )}
      </div>
      {message && <p className="tiny" style={{ marginTop: 8 }}>{message}</p>}
      {error && <p className="tiny" style={{ marginTop: 8, color: "#b5471f" }}>{error}</p>}
    </div>
  );
}
