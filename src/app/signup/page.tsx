"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

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
      options: { data: { name, age_attested_min: 13, accepted_terms: true } },
    });
    setLoading(false);
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
        <p className="title" style={{ marginBottom: 8 }}>Check your email</p>
        <p className="muted">
          We sent a confirmation link to <strong>{email}</strong>. Click it, then come back and log in.
        </p>
        <Button variant="primary" style={{ marginTop: 18 }} onClick={() => router.push("/login")}>
          Go to log in
        </Button>
      </>
    );
  }

  return (
    <>
      <p className="title" style={{ marginBottom: 4 }}>Sign up</p>
      <p className="muted" style={{ marginBottom: 14 }}>Free, always — the Experience Board and File Board.</p>
      <form onSubmit={handleSubmit}>
        <label className="field-label" style={{ marginTop: 0 }}>Your name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <label className="field-label">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <label className="field-label">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <label className="row" style={{ gap: 8, marginTop: 14, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: "auto", marginTop: 3 }}
          />
          <span className="tiny">
            I am 13 or older (if you are younger, a parent or guardian should create the account), and I agree to the
            Terms of Service and the content and safety policies.
          </span>
        </label>
        {error && (
          <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" style={{ width: "100%", marginTop: 18 }} disabled={loading || !agreed}>
          {loading ? "Signing up…" : "Sign up free"}
        </Button>
      </form>
      <p className="tiny" style={{ marginTop: 14 }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--accent)" }}>
          Log in
        </Link>
      </p>
    </>
  );
}
