"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { useTurnstile } from "@/components/ui/Turnstile";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useLanguage } from "@/contexts/LanguageContext";
import { rich } from "@/lib/i18n/rich";

export default function SignupPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const ts = useTurnstile();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      // Recorded by the database when the account is created: the 13+ age
      // attestation and acceptance of the current terms and policies.
      // The link in the confirmation email signs the person in and opens the first-time questions
      // on whichever address this page is on (test or real).
      options: { captchaToken: ts.token, data: { name, age_attested_min: 13, accepted_terms: true }, emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding` },
    });
    setLoading(false);
    ts.reset();
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off for this project — go straight to
      // onboarding, matching the prototype's sign-up flow.
      router.push("/onboarding");
    } else {
      // Email confirmation is required before a session exists.
      setNeedsEmailConfirmation(true);
    }
  }

  if (needsEmailConfirmation) {
    return (
      <>
        <p role="heading" aria-level={1} className="title" style={{ marginBottom: 8 }}>{t("signup.checkEmail")}</p>
        <p className="muted">{rich(t("signup.confirmationSent", { email }), { b: (c) => <strong>{c}</strong> })}</p>
        <Button variant="primary" style={{ marginTop: 18 }} onClick={() => router.push("/login")}>
          {t("signup.goToLogin")}
        </Button>
      </>
    );
  }

  return (
    <>
      <p role="heading" aria-level={1} className="title" style={{ marginBottom: 4 }}>{t("signup.title")}</p>
      <p className="muted" style={{ marginBottom: 14 }}>{t("signup.freeLine")}</p>
      <form onSubmit={handleSubmit}>
        <label className="field-label" style={{ marginTop: 0 }}>{t("signup.name")}</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <label className="field-label">{t("login.email")}</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <label className="field-label">{t("login.password")}</label>
        <PasswordInput
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <p className="tiny" style={{ margin: "4px 0 0" }}>{t("signup.passwordHint")}</p>
        <label className="row" style={{ gap: 8, marginTop: 14, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: "auto", marginTop: 3 }}
          />
          <span className="tiny">
            {rich(t("signup.agree"), {
              t: (c) => <Link href="/policy/terms" target="_blank" style={{ color: "var(--accent-link)" }}>{c}</Link>,
              y: (c) => <Link href="/policy/copyright" target="_blank" style={{ color: "var(--accent-link)" }}>{c}</Link>,
              p: (c) => <Link href="/policy/privacy" target="_blank" style={{ color: "var(--accent-link)" }}>{c}</Link>,
            })}
          </span>
        </label>
        {error && (
          <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>
            {error}
          </p>
        )}
        {ts.widget}
        <Button variant="primary" type="submit" style={{ width: "100%", marginTop: 18 }} disabled={loading || !agreed || !ts.ready}>
          {loading ? t("signup.submitting") : t("common.signUpFree")}
        </Button>
      </form>
      <p className="tiny" style={{ marginTop: 14 }}>
        {t("signup.haveAccount")}{" "}
        <Link href="/login" style={{ color: "var(--accent-link)" }}>
          {t("login.submit")}
        </Link>
      </p>
    </>
  );
}
