"use client";

import { useEffect, useImperativeHandle, useState, type Ref } from "react";
import { BYO_PROVIDERS, providersForRegion, type ByoProviderId } from "@/lib/ai/byo-providers";
import { createClient } from "@/lib/supabase/client";
import type { Region } from "@/lib/types";

export interface AiKeyFormHandle {
  /** Saves the key if one was typed. Resolves true when there's nothing to save or it saved fine. */
  submitIfFilled: () => Promise<boolean>;
}

interface Saved {
  hasKey: boolean;
  provider: ByoProviderId | null;
  model: string | null;
}

interface HelpRow {
  provider_id: string;
  region: Region;
  title: string;
  steps: string[];
  note: string | null;
  link_url: string | null;
}

// `standalone` (Settings) shows its own Save/Remove buttons. Onboarding passes
// standalone={false} and saves through the page's Continue button instead.
// `region` picks which free-key help is shown (the text is editable data).
export function AiKeyForm({ ref, standalone = true, region = null }: { ref?: Ref<AiKeyFormHandle>; standalone?: boolean; region?: Region | null }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  // What the member picked; until they pick, the first service for their region is suggested.
  const [providerChoice, setProviderChoice] = useState<ByoProviderId | null>(null);
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const provider: ByoProviderId = providerChoice ?? (region ? providersForRegion(region)[0] : "google");
  const model = modelChoice ?? BYO_PROVIDERS[provider].defaultModel;
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [help, setHelp] = useState<HelpRow[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    createClient()
      .from("ai_key_help")
      .select("provider_id, region, title, steps, note, link_url")
      .order("sort_order")
      .then(({ data }) => setHelp((data ?? []) as HelpRow[]));
  }, []);

  useEffect(() => {
    fetch("/api/ai/key")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSaved(d))
      .catch(() => {});
  }, []);

  function pickProvider(id: ByoProviderId) {
    setProviderChoice(id);
    setModelChoice(null);
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
        {providersForRegion(region).map((id) => (
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
        onChange={(e) => setModelChoice(e.target.value)}
        style={{ marginTop: 8 }}
        aria-label="Model name"
      />
      <p className="tiny" style={{ marginTop: 6 }}>
        Your key is checked once, then stored encrypted and used only to answer your questions.
      </p>
      {!region ? (
        <p className="tiny" style={{ marginTop: 6 }}>Choose where you are above to see which free AI services we suggest.</p>
      ) : (
        <div className="tiny" style={{ marginTop: 8 }}>
          We sincerely recommend using your own API instead of the hub&apos;s default AI. If you use the hub&apos;s default AI,
          it may be very slow. Don&apos;t have one? You can get a free one from the services below.
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={() => setShowHelp((v) => !v)}>
              Get free API instructions
            </button>
          </div>
          {showHelp &&
            help
              .filter((h) => h.region === region)
              .map((h) => (
                <div key={h.provider_id} style={{ marginTop: 10 }}>
                  <strong>{h.title}</strong>
                  <ol style={{ margin: "4px 0 4px 18px", padding: 0 }}>
                    {h.steps.map((s, i) => <li key={i} style={{ marginBottom: 3 }}>{s}</li>)}
                  </ol>
                  {h.note && <span>{h.note} </span>}
                  {h.link_url && <a href={h.link_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Open the site ↗</a>}
                </div>
              ))}
          {showHelp && help.filter((h) => h.region === region).length === 0 && <p style={{ marginTop: 8 }}>No instructions are available yet.</p>}
        </div>
      )}
      <p className="tiny" style={{ marginTop: 6 }}>
        Already have a key? Choose its service in the list above and paste it.{" "}
        <a href={info.keyHelpUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{info.label.replace(" (free key available)", "").replace(" (free plan available)", "")} ↗</a>
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
