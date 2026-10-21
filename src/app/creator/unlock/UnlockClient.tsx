"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
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
  const { t, lang } = useLanguage();
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
    if (code.length < 10) return setMessage(t("creator.unlock.min10"));
    if (code !== code2) return setMessage(t("creator.unlock.noMatch"));
    setBusy(true);
    const { data, error } = await supabase.rpc("set_creator_code", { p_new: code });
    if (error || !(data as { ok: boolean })?.ok) {
      setBusy(false);
      return setMessage(error?.message ?? (data as { error?: string })?.error ?? t("creator.unlock.saveFail"));
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
    setMessage((r.error ?? "") + (r.attempts_left !== undefined ? ` ${t("creator.unlock.triesLeft", { n: r.attempts_left })}` : ""));
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
    setMessage(r.error ?? t("creator.unlock.keyFail"));
    await load();
  }

  if (!status) return <p className="muted">{t("creator.unlock.checking")}</p>;

  const showKeys = keys !== null;

  return (
    <>
      <BackLink href="/profile" label={t("staff.backToProfile")} />
      <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
        <p className="title" style={{ margin: 0 }}>{t("creator.unlock.title")}</p>
        <LanguageSelect style={{ width: "auto", padding: "6px 10px", fontSize: 13 }} />
      </div>

      {showKeys ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>{t("creator.unlock.saveKeys")}</p>
          <p className="muted">
            {t("creator.unlock.saveKeysHelp")}
          </p>
          <pre style={{ background: "var(--bg)", padding: 10, borderRadius: 8, overflowX: "auto" }}>{keys!.join("\n")}</pre>
          <Button variant="primary" onClick={() => router.replace("/creator")}>{t("creator.unlock.savedThem")}</Button>
        </div>
      ) : useKey ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>{t("creator.unlock.useKeyTitle")}</p>
          <p className="muted">{t("creator.unlock.useKeyHelp")}</p>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="AOE-RK-XXXX-XXXX-XXXX" autoComplete="off" />
          <div className="row" style={{ gap: 8 }}>
            <Button variant="primary" disabled={busy || !key.trim()} onClick={submitKey}>{t("creator.unlock.useThisKey")}</Button>
            <Button onClick={() => setUseKey(false)}>{t("common.back")}</Button>
          </div>
        </div>
      ) : !status.aal2 ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>{t("creator.unlock.step1")}</p>
          <TwoStepPanel onVerified={load} />
          {status.has_factor && (
            <p className="tiny" style={{ marginTop: 12 }}>
              {t("creator.unlock.lostApp")}{" "}
              <button className="btn small" onClick={() => setUseKey(true)}>{t("creator.unlock.useKeyTitle")}</button>
            </p>
          )}
        </div>
      ) : !status.has_code ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>{t("creator.unlock.step2Choose")}</p>
          <p className="muted">
            {t("creator.unlock.codeHelp")}
          </p>
          <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("creator.unlock.codePh")} autoComplete="new-password" />
          <input type="password" value={code2} onChange={(e) => setCode2(e.target.value)} placeholder={t("creator.unlock.again")} autoComplete="new-password" style={{ marginTop: 8 }} />
          <Button variant="primary" style={{ marginTop: 8 }} disabled={busy} onClick={setNewCode}>{t("creator.unlock.saveCode")}</Button>
        </div>
      ) : (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>{t("creator.unlock.step2Code")}</p>
          {status.locked && (
            <p className="muted" style={{ color: "#b5471f" }}>
              {t("creator.unlock.locked", { time: status.locked_until ? new Date(status.locked_until).toLocaleTimeString(lang) : t("creator.unlock.15min") })}
            </p>
          )}
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code && submitCode()}
            placeholder={t("creator.unlock.codePh")}
            autoComplete="off"
          />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button variant="primary" disabled={busy || !code || status.locked} onClick={submitCode}>{t("creator.unlock.open")}</Button>
            <Button onClick={() => setUseKey(true)}>{t("creator.unlock.lockedOut")}</Button>
          </div>
        </div>
      )}
      {message && <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>{message}</p>}
    </>
  );
}
