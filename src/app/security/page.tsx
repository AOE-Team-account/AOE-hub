"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { TwoStepPanel } from "@/components/security/TwoStepPanel";
import { BackLink } from "@/components/ui/BackLink";

function SecurityContent() {
  const router = useRouter();
  const params = useSearchParams();
  const ready = useRequireAuthPage("/experience");
  const next = params.get("next");
  // Only ever return to one of the panel pages (never an arbitrary address).
  const safeNext = next === "/mod" || next === "/creator" || next === "/creator/unlock" ? next : null;
  if (!ready) return null;
  return (
    <>
      <BackLink href="/settings" label="Back to settings" />
      <p className="title" style={{ marginBottom: 6 }}>Two-step sign-in</p>
      <div className="card">
        <TwoStepPanel onVerified={() => safeNext && router.replace(safeNext)} />
      </div>
    </>
  );
}

export default function SecurityPage() {
  return (
    <Suspense fallback={null}>
      <SecurityContent />
    </Suspense>
  );
}
