"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { contactSentence } from "@/lib/site";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const { consumePendingReturn } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      // A suspended or deleted account is blocked at sign-in by the auth service.
      setError(
        /banned/i.test(signInError.message)
          ? `${t("login.banned")} ${contactSentence(t)}`
          : signInError.message
      );
      return;
    }
    // Existing user path — skips onboarding, returns to wherever they were.
    router.push(consumePendingReturn());
  }

  return (
    <>
      <p className="title" style={{ marginBottom: 14 }}>{t("login.title")}</p>
      <form onSubmit={handleSubmit}>
        <label className="field-label" style={{ marginTop: 0 }}>{t("login.email")}</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <label className="field-label">{t("login.password")}</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && (
          <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" style={{ width: "100%", marginTop: 18 }} disabled={loading}>
          {loading ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
      <p className="tiny" style={{ marginTop: 14 }}>
        {t("login.newHere")}{" "}
        <Link href="/signup" style={{ color: "var(--accent)" }}>
          {t("common.signUpFree")}
        </Link>
      </p>
    </>
  );
}
