"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";
import { CONTACT_EMAIL } from "@/lib/site";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPassword />
    </Suspense>
  );
}

// Step 1 of resetting a password: ask for the email. The answer is the same
// whether or not the email has an account, so this page cannot be used to
// find out who is a member.
function ForgotPassword() {
  const { t } = useLanguage();
  const expired = useSearchParams().get("expired") === "1";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setBusy(false);
    // Only a rate limit is worth telling; every other outcome looks like success.
    if (err && /rate limit|too many|seconds/i.test(err.message)) return setError(t("forgot.slowDown"));
    setSent(true);
  }

  return (
    <>
      <p className="title" style={{ marginBottom: 4 }}>{t("forgot.title")}</p>
      {expired && !sent && <p className="muted" style={{ color: "#b5471f", marginBottom: 10 }}>{t("forgot.expired")}</p>}
      {sent ? (
        <div className="card">
          <p className="title" style={{ marginBottom: 4 }}>{t("forgot.checkEmail")}</p>
          <p className="muted">{t("forgot.sent")}</p>
          <p className="tiny" style={{ marginTop: 10 }}>
            <Link href="/login" style={{ color: "var(--accent)" }}>{t("forgot.backToLogin")}</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="muted" style={{ marginBottom: 10 }}>{t("forgot.help")}</p>
          <label className="field-label" style={{ marginTop: 0 }}>{t("login.email")}</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {error && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{error}</p>}
          <Button variant="primary" type="submit" style={{ width: "100%", marginTop: 14 }} disabled={busy || !email.trim()}>
            {busy ? t("forgot.sending") : t("forgot.send")}
          </Button>
          <p className="tiny" style={{ marginTop: 14 }}>
            <Link href="/login" style={{ color: "var(--accent)" }}>{t("forgot.backToLogin")}</Link>
          </p>
          {CONTACT_EMAIL && <p className="tiny" style={{ marginTop: 6 }}>{t("forgot.lostEmail", { email: CONTACT_EMAIL })}</p>}
        </form>
      )}
    </>
  );
}

