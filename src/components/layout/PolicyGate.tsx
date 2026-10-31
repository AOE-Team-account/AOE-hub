"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

// Pages a signed-in person may still open while a policy is waiting for
// their agreement: the update page itself, the policies they are asked to
// read, and Settings (to download their data or delete their account).
const OPEN = ["/policies-update", "/policy/", "/settings"];

// When a newer version of any policy has been published, sends a signed-in
// person to the "review and agree" page until they accept it. The database
// decides what is pending (pending_terms); nothing is hard-coded here.
export function PolicyGate() {
  const { user, hydrated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const userId = user?.id ?? null;
  const allowed = OPEN.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"));

  useEffect(() => {
    if (!hydrated || !userId || allowed) return;
    let cancelled = false;
    createClient()
      .rpc("pending_terms", { p_scope: "hub" })
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data) && data.length > 0) router.replace("/policies-update");
      });
    return () => { cancelled = true; };
  }, [hydrated, userId, allowed, pathname, router]);

  return null;
}
