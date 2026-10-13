"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { TwoStepPanel } from "@/components/security/TwoStepPanel";
import { BackLink } from "@/components/ui/BackLink";

interface Status {
  is_creator: boolean;
  has_code: boolean;
  has_factor: boolean;
  aal2: boolean;
  unlocked: boolean;
  locked: boolean;
  locked_until: string | null;
  keys_left: number;
}

export function UnlockClient() {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [key, setKey] = useState("");
  const [useKey, setUseKey] = useState(false);
  const [keys, setKeys] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("creator_status");
    const s = data as Status;
    setStatus(s);
    if (s?.unlocked && !keys) router.replace("/creator");
  }, [supabase, router, keys]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setNewCode() {
    setMessage(null);
    if (code.length < 10) return setMessage("Use at least 10 characters.");
    if (code !== code2) return setMessage("The two entries don't match.");
    setBusy(true);
    const { data, error } = await supabase.rpc("set_creator_code", { p_new: code });
    if (error || !(data as { ok: boolean })?.ok) {
      setBusy(false);
      return setMessage(error?.message ?? (data as { error?: string })?.error ?? "Could not save the code.");
    }
    const { data: made, error: keyErr } = await supabase.rpc("create_recovery_keys");
    setBusy(false);
    if (keyErr) return setMessage(keyErr.message);
    setKeys(made as string[]);
    setCode("");
    setCode2("");
  }

  async function submitCode() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("verify_creator_code", { p_code: code });
    setBusy(false);
    if (error) return setMessage(error.message);
    const r = data as { ok: boolean; error?: string; attempts_left?: number };
    if (r.ok) return router.replace("/creator");
    setMessage(r.error + (r.attempts_left !== undefined ? ` ${r.attempts_left} tries left.` : ""));
    await load();
  }

  async function submitKey() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("use_recovery_key", { p_key: key });
    setBusy(false);
    if (error) return setMessage(error.message);
    const r = data as { ok: boolean; error?: string };
    if (r.ok) return router.replace("/creator");
    setMessage(r.error ?? "That key did not work.");
    await load();
  }

  if (!status) return <p className="muted">Checking…</p>;

  const showKeys = keys !== null;

  return (
    <>
      <BackLink href="/profile" label="Back to my profile" />
      <p className="title" style={{ marginBottom: 6 }}>Open the Creator panel</p>

      {showKeys ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>Save your recovery keys</p>
          <p className="muted">
            Each key works once and gets you back in if you lose your authenticator app or forget the access code. They are
            shown only now. Keep them offline (printed, or in a password manager), never on the device you sign in from.
          </p>
          <pre style={{ background: "var(--bg)", padding: 10, borderRadius: 8, overflowX: "auto" }}>{keys!.join("\n")}</pre>
          <Button variant="primary" onClick={() => router.replace("/creator")}>I have saved them</Button>
        </div>
      ) : useKey ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>Use a recovery key</p>
          <p className="muted">Type one of your recovery keys. It works once.</p>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="AOE-RK-XXXX-XXXX-XXXX" autoComplete="off" />
          <div className="row" style={{ gap: 8 }}>
            <Button variant="primary" disabled={busy || !key.trim()} onClick={submitKey}>Use this key</Button>
            <Button onClick={() => setUseKey(false)}>Back</Button>
          </div>
        </div>
      ) : !status.aal2 ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>Step 1: two-step sign-in</p>
          <TwoStepPanel onVerified={load} />
          {status.has_factor && (
            <p className="tiny" style={{ marginTop: 12 }}>
              Lost your authenticator app?{" "}
              <button className="btn small" onClick={() => setUseKey(true)}>Use a recovery key</button>
            </p>
          )}
        </div>
      ) : !status.has_code ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>Step 2: choose your access code</p>
          <p className="muted">
            Used every time you open this panel, together with your sign-in. At least 10 characters. It is stored scrambled; nobody can read it back.
          </p>
          <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" autoComplete="new-password" />
          <input type="password" value={code2} onChange={(e) => setCode2(e.target.value)} placeholder="Type it again" autoComplete="new-password" style={{ marginTop: 8 }} />
          <Button variant="primary" style={{ marginTop: 8 }} disabled={busy} onClick={setNewCode}>Save the code</Button>
        </div>
      ) : (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>Step 2: access code</p>
          {status.locked && (
            <p className="muted" style={{ color: "#b5471f" }}>
              Too many wrong tries. You can try again after {status.locked_until ? new Date(status.locked_until).toLocaleTimeString() : "15 minutes"}, or use a recovery key.
            </p>
          )}
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code && submitCode()}
            placeholder="Access code"
            autoComplete="off"
          />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button variant="primary" disabled={busy || !code || status.locked} onClick={submitCode}>Open the panel</Button>
            <Button onClick={() => setUseKey(true)}>Locked out?</Button>
          </div>
        </div>
      )}
      {message && <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>{message}</p>}
    </>
  );
}
