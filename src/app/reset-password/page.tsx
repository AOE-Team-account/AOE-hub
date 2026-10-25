"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";

// Step 2: the person arrived from the email link (which signed them in for
// this one purpose) and chooses a new password.
export default function ResetPasswordPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "nolink" | "done">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setState(data.user ? "ready" : "nolink"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError(t("reset.tooShort"));
    if (pw !== pw2) return setError(t("reset.noMatch"));
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    if (err) {
      setBusy(false);
      return setError(/same|different/i.test(err.message) ? t("reset.same") : /weak|short|least/i.test(err.message) ? t("reset.tooShort") : t("reset.failed"));
    }
    // A reset signs every other device out, in case the old password was known to someone else.
    await supabase.auth.signOut({ scope: "others" });
    setBusy(false);
    setState("done");
  }

  if (state === "checking") return <p className="muted">{t("common.loading")}</p>;

  if (state === "nolink") {
    return (
      <div className="card">
        <p className="title" style={{ marginBottom: 4 }}>{t("reset.title")}</p>
        <p className="muted">{t("reset.noLink")}</p>
        <p style={{ marginTop: 10 }}><Link href="/forgot-password" className="btn small">{t("reset.askAgain")}</Link></p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="card">
        <p className="title" style={{ marginBottom: 4 }}>{t("reset.doneTitle")}</p>
        <p className="muted">{t("reset.done")}</p>
        <Button variant="primary" style={{ marginTop: 10 }} onClick={() => router.push("/experience")}>{t("reset.continue")}</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <p className="title" style={{ marginBottom: 4 }}>{t("reset.title")}</p>
      <p className="muted" style={{ marginBottom: 10 }}>{t("reset.help")}</p>
      <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("reset.newPw")} autoComplete="new-password" />
      <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t("reset.again")} autoComplete="new-password" style={{ marginTop: 8 }} />
      {error && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{error}</p>}
      <Button variant="primary" type="submit" style={{ width: "100%", marginTop: 14 }} disabled={busy || !pw}>
        {busy ? t("common.saving") : t("reset.save")}
      </Button>
    </form>
  );
}
