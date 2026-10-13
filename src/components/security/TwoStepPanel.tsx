"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

type Phase = "loading" | "off" | "enrolling" | "challenge" | "on";

// Two-step sign-in with an authenticator app (TOTP). Used from Settings and,
// for the Creator and for Watchers/Deacons, as the first step into a panel.
export function TwoStepPanel({ onVerified }: { onVerified?: () => void }) {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.totp ?? [])[0];
    if (!verified) {
      setFactorId(null);
      setPhase("off");
      return;
    }
    setFactorId(verified.id);
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setPhase(aal?.currentLevel === "aal2" ? "on" : "challenge");
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function startEnroll() {
    setBusy(true);
    setError(null);
    // Clear half-finished attempts so they don't pile up.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of (all?.all ?? []).filter((x) => x.status === "unverified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `AOEhub ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (err || !data) return setError(err?.message ?? "Could not start. Please try again.");
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setPhase("enrolling");
  }

  async function submitCode() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr || !ch) {
      setBusy(false);
      return setError(chErr?.message ?? "Could not check the code.");
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (vErr) return setError("That code is not right. Check the app and try again.");
    setCode("");
    setQr(null);
    setSecret(null);
    await refresh();
    onVerified?.();
  }

  async function turnOff() {
    if (!factorId) return;
    setBusy(true);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (err) return setError(err.message);
    await refresh();
  }

  if (phase === "loading") return <p className="muted">Checking…</p>;

  return (
    <div>
      {phase === "off" && (
        <>
          <p className="muted">
            Two-step sign-in asks for a 6-digit code from an authenticator app (such as Google Authenticator, Microsoft
            Authenticator or Authy) every time you sign in, so a stolen password alone is not enough.
          </p>
          <Button variant="primary" disabled={busy} onClick={startEnroll}>Turn on two-step sign-in</Button>
        </>
      )}
      {phase === "enrolling" && (
        <>
          <p className="muted">1. Open your authenticator app and scan this picture (or type the key by hand).</p>
          {qr && (
            // The QR code is an SVG data URI produced by the auth service.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: "#fff", padding: 6, borderRadius: 8 }} />
          )}
          {secret && <p className="tiny" style={{ wordBreak: "break-all" }}>Key: <code>{secret}</code></p>}
          <p className="muted" style={{ marginTop: 8 }}>2. Type the 6-digit code the app shows now.</p>
          <div className="row" style={{ gap: 8 }}>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            <Button variant="primary" disabled={busy || code.trim().length !== 6} onClick={submitCode}>Confirm</Button>
          </div>
        </>
      )}
      {phase === "challenge" && (
        <>
          <p className="muted">Enter the 6-digit code from your authenticator app to continue.</p>
          <div className="row" style={{ gap: 8 }}>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && code.trim().length === 6 && submitCode()} placeholder="123456" />
            <Button variant="primary" disabled={busy || code.trim().length !== 6} onClick={submitCode}>Continue</Button>
          </div>
        </>
      )}
      {phase === "on" && (
        <>
          <p className="muted">Two-step sign-in is on for this account, and this session has passed it.</p>
          <Button variant="danger" size="small" disabled={busy} onClick={turnOff}>Turn off</Button>
        </>
      )}
      {error && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
