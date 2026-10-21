"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface PoolRow {
  id: string; provider: string; label: string; hint: string; active: boolean; created_at: string;
  last_check_at: string | null; last_check_ok: boolean | null; last_check_note: string | null;
}
interface FileRow { provider: string; label: string; hint: string }

const SERVICES: { id: string; name: string; help: string }[] = [
  { id: "google", name: "Google AI Studio (Gemini)", help: "Answers, translation and search. Each key from a different Google project adds its own free allowance." },
  { id: "groq", name: "Groq", help: "A second company for answers and translation; used when Google is full." },
  { id: "qwen-intl", name: "Qwen (international / Singapore)", help: "Alibaba's Qwen, for answers and translation." },
  { id: "qwen-cn", name: "Qwen (mainland China)", help: "Alibaba's Qwen on the mainland-China service." },
];
const nameOf = (id: string) => SERVICES.find((s) => s.id === id)?.name ?? id;

// The hub's AI key pool: add keys here instead of in the settings file. A key
// is checked with its company before it is saved, is stored encrypted, and is
// never shown again — only its name and last four characters.
export function KeyPool() {
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [provider, setProvider] = useState("google");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/creator/ai-keys");
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setRows(data.keys ?? []); setFileRows(data.fileKeys ?? []); }
    else setError(data?.error ?? "Could not read the key pool.");
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch("/api/creator/ai-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data?.error ?? "That did not work."); return false; }
    setMessage(body.action === "test" ? (data.ok ? `Working. ${data.note ?? ""}` : data.note) : done);
    await load();
    return true;
  }

  return (
    <div className="card">
      <p className="title" style={{ marginBottom: 4 }}>AI key pool</p>
      <p className="muted" style={{ marginBottom: 10 }}>
        Add the hub&apos;s AI keys here instead of in the settings file. Each key is checked with its company, then stored encrypted
        and <strong>never shown again</strong> (only its name and last four characters). The hub tries the keys in the order they were
        added and rests any key that hits its limit, then comes back to it. Keys in the settings file keep working too.
      </p>

      <div className="row wrap" style={{ gap: 8 }}>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ width: "auto" }}>
          {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input style={{ width: 200 }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A name, e.g. Google project 3" maxLength={60} />
        <input style={{ flex: 1, minWidth: 220 }} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the API key" autoComplete="off" spellCheck={false} />
        <Button variant="primary" disabled={busy || !label.trim() || key.trim().length < 8} onClick={async () => {
          const ok = await act({ action: "add", provider, label, key }, "Key checked and added to the pool.");
          if (ok) { setKey(""); setLabel(""); }
        }}>{busy ? "Checking…" : "Check and add"}</Button>
      </div>
      <p className="tiny" style={{ marginTop: 6 }}>{SERVICES.find((s) => s.id === provider)?.help}</p>
      {message && <p className="tiny" style={{ marginTop: 6, color: "var(--accent)" }}>{message}</p>}
      {error && <p className="tiny" style={{ marginTop: 6, color: "#b5471f" }}>{error}</p>}

      <p className="label" style={{ fontWeight: 500, margin: "14px 0 6px" }}>Keys in the pool</p>
      {rows.length === 0 && fileRows.length === 0 && <p className="muted">No keys yet.</p>}
      {fileRows.map((r, i) => (
        <div className="row between wrap" key={`f${i}`} style={{ gap: 8, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
          <span><strong>{r.label}</strong> <span className="tiny">· {nameOf(r.provider)} · …{r.hint}</span></span>
          <span className="tiny">In the settings file (change it there)</span>
        </div>
      ))}
      {rows.map((r) => (
        <div className="row between wrap" key={r.id} style={{ gap: 8, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
          <span>
            <strong>{r.label}</strong> <span className="tiny">· {nameOf(r.provider)} · …{r.hint}{r.active ? "" : " · switched off"}</span>
            <br />
            <span className="tiny">
              {r.last_check_ok === null ? "Not checked yet" : `${r.last_check_ok ? "OK" : "Problem"}: ${r.last_check_note ?? ""} (${r.last_check_at ? new Date(r.last_check_at).toLocaleString() : ""})`}
            </span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <Button size="small" disabled={busy} onClick={() => act({ action: "test", id: r.id }, "")}>Test</Button>
            <Button size="small" disabled={busy} onClick={() => act({ action: "toggle", id: r.id, active: !r.active }, r.active ? "Switched off." : "Switched on.")}>{r.active ? "Switch off" : "Switch on"}</Button>
            <Button size="small" variant="danger" disabled={busy} onClick={() => { if (confirm(`Remove "${r.label}" from the pool for good? The stored key is deleted.`)) act({ action: "remove", id: r.id }, "Key removed."); }}>Remove</Button>
          </span>
        </div>
      ))}
    </div>
  );
}
