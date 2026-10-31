"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { POLICY_NAME_KEYS, isPolicySlug, type PolicySlug } from "@/lib/policies/slugs";

interface Pending { kind: string; version: string }

// The database stores 'safety-policy'; the page address is /policy/safety.
const slugFor = (kind: string): PolicySlug | null => {
  const s = kind === "safety-policy" ? "safety" : kind;
  return isPolicySlug(s) ? s : null;
};

export default function PoliciesUpdatePage() {
  const { t } = useLanguage();
  const { signOut, consumePendingReturn } = useAuth();
  const router = useRouter();
  const ready = useRequireAuthPage("/");
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ready) return;
    createClient().rpc("pending_terms", { p_scope: "hub" }).then(({ data }) => setPending((data as Pending[] | null) ?? []));
  }, [ready]);

  // Nothing waiting (for example they opened this page by hand): go on to the hub.
  useEffect(() => {
    if (pending && pending.length === 0) router.replace("/experience");
  }, [pending, router]);

  async function agree() {
    if (!pending) return;
    setBusy(true);
    setError(false);
    const supabase = createClient();
    for (const p of pending) {
      const { error: e } = await supabase.rpc("accept_terms", { p_kind: p.kind, p_version: p.version });
      if (e) { setError(true); setBusy(false); return; }
    }
    router.replace(consumePendingReturn());
  }

  if (!ready || !pending || pending.length === 0) return null;
  return (
    <>
      <p role="heading" aria-level={1} className="title" style={{ marginBottom: 6 }}>{t("policyUpdate.title")}</p>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>{t("policyUpdate.body")}</p>
        <ul style={{ paddingLeft: 18 }}>
          {pending.map((p) => {
            const slug = slugFor(p.kind);
            return (
              <li key={p.kind + p.version} style={{ margin: "6px 0" }}>
                {slug ? (
                  <Link href={`/policy/${slug}`} target="_blank" style={{ color: "var(--accent)" }}>{t(POLICY_NAME_KEYS[slug])}</Link>
                ) : p.kind}
                {" "}<span className="tiny">({t("policyUpdate.version", { version: p.version })})</span>
              </li>
            );
          })}
        </ul>
        {error && <p className="muted" style={{ color: "#b5471f" }}>{t("policyUpdate.error")}</p>}
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <Button variant="primary" onClick={agree} disabled={busy}>{busy ? t("common.saving") : t("policyUpdate.agree")}</Button>
          <Button onClick={() => signOut()}>{t("common.signOut")}</Button>
        </div>
        <p className="tiny" style={{ marginTop: 12 }}>
          {t("policyUpdate.decline")}{" "}
          <Link href="/settings" style={{ color: "var(--accent)" }}>{t("policyUpdate.settings")}</Link>
        </p>
      </div>
    </>
  );
}
