"use client";

import { useEffect, useImperativeHandle, useState, type Ref } from "react";
import { BYO_PROVIDERS, BYO_PROVIDER_ORDER, type ByoProviderId } from "@/lib/ai/byo-providers";

export interface AiKeyFormHandle {
  /** Saves the key if one was typed. Resolves true when there's nothing to save or it saved fine. */
  submitIfFilled: () => Promise<boolean>;
}

interface Saved {
  hasKey: boolean;
  provider: ByoProviderId | null;
  model: string | null;
}

// `standalone` (Settings) shows its own Save/Remove buttons. Onboarding passes
// standalone={false} and saves through the page's Continue button instead.
export function AiKeyForm({ ref, standalone = true }: { ref?: Ref<AiKeyFormHandle>; standalone?: boolean }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [provider, setProvider] = useState<ByoProviderId>("google");
  const [model, setModel] = useState(BYO_PROVIDERS.google.defaultModel);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/key")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSaved(d))
      .catch(() => {});
  }, []);

  function pickProvider(id: ByoProviderId) {
    setProvider(id);
    setModel(BYO_PROVIDERS[id].defaultModel);
  }

  async function save(): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/ai/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model, key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save the key.");
        return false;
      }
      setSaved(data);
      setKey("");
      setNote("Saved. The assistant will use your key from now on.");
      return true;
    } catch {
      setError("Could not reach the server. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch("/api/ai/key", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setSaved({ hasKey: false, provider: null, model: null });
      setNote("Removed. The assistant is back to the hub's default.");
    } else {
      setError("Could not remove the key.");
    }
  }

  useImperativeHandle(ref, () => ({
    submitIfFilled: async () => (key.trim() ? save() : true),
  }));

  const info = BYO_PROVIDERS[provider];

  return (
    <div>
      {saved?.hasKey && saved.provider && (
        <p className="tiny" style={{ marginBottom: 10 }}>
          Using your own key: <strong>{BYO_PROVIDERS[saved.provider].label}</strong> · {saved.model}
        </p>
      )}
      <select value={provider} onChange={(e) => pickProvider(e.target.value as ByoProviderId)} style={{ maxWidth: 320 }}>
        {BYO_PROVIDER_ORDER.map((id) => (
          <option key={id} value={id}>{BYO_PROVIDERS[id].label}</option>
        ))}
      </select>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={saved?.hasKey ? "Paste a new key to replace the saved one" : "Paste your API key"}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        style={{ marginTop: 8 }}
      />
      <input
        placeholder="Model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        style={{ marginTop: 8 }}
        aria-label="Model name"
      />
      <p className="tiny" style={{ marginTop: 6 }}>
        Don&apos;t have a key? Get one from{" "}
        <a href={info.keyHelpUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
          {info.label.replace(" (free key available)", "")}
        </a>
        . Your key is checked once, then stored encrypted and used only to answer your questions.
      </p>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        {standalone && (
          <button className="btn primary small" disabled={busy || !key.trim()} onClick={save}>
            {busy ? "Checking…" : "Save key"}
          </button>
        )}
        {standalone && saved?.hasKey && (
          <button className="btn small" disabled={busy} onClick={remove}>
            Remove my key
          </button>
        )}
      </div>
      {error && <p className="tiny" style={{ color: "#b5471f", marginTop: 8 }}>{error}</p>}
      {note && <p className="tiny" style={{ marginTop: 8 }}>{note}</p>}
    </div>
  );
}
