"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { userFromProfileRow, type ProfileRow } from "@/lib/profile";
import type { User } from "@/lib/types";

// Real Supabase auth (Phase 2). Session lives in cookies (via @supabase/ssr)
// so it's readable both client- and server-side; this context just mirrors
// that session into React state and looks up the matching `profiles` row.

interface AuthContextValue {
  status: "guest" | "authed";
  user: User | null;
  /** False until the initial session check has completed. Gated pages MUST
   *  wait for this before deciding whether to redirect a visitor away —
   *  otherwise a page's own mount effect can redirect before the session
   *  has even been read, incorrectly bouncing an already-signed-in visitor
   *  on every hard refresh of a gated route. */
  hydrated: boolean;
  isSignInModalOpen: boolean;
  /** Returns true if already signed in; otherwise opens the sign-in modal
   *  and remembers where to return to, returning false so the caller can
   *  bail out of whatever gated action triggered this. */
  requireAuth: () => boolean;
  openSignInModal: () => void;
  closeSignInModal: () => void;
  signOut: () => Promise<void>;
  /** Consumes and clears the page to return to after login/onboarding. */
  consumePendingReturn: () => string;
  /** Re-fetches the profiles row for the current user (e.g. after onboarding
   *  writes onboarding_experience/onboarding_reason, or points change). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const DEFAULT_RETURN = "/experience";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"guest" | "authed">("guest");
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isSignInModalOpen, setSignInModalOpen] = useState(false);
  const [pendingReturn, setPendingReturn] = useState<string>(DEFAULT_RETURN);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  async function loadProfile(userId: string) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error || !data) {
      setUser(null);
      return;
    }
    setUser(userFromProfileRow(data as ProfileRow));
  }

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        setStatus("authed");
        await loadProfile(session.user.id);
      }
      setHydrated(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setStatus("authed");
        await loadProfile(session.user.id);
      } else {
        setStatus("guest");
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requireAuth() {
    if (status === "authed") return true;
    setPendingReturn(pathname || DEFAULT_RETURN);
    setSignInModalOpen(true);
    return false;
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  function consumePendingReturn() {
    const target = pendingReturn || DEFAULT_RETURN;
    setPendingReturn(DEFAULT_RETURN);
    return target;
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  const value = useMemo(
    () => ({
      status,
      user,
      hydrated,
      isSignInModalOpen,
      requireAuth,
      openSignInModal: () => setSignInModalOpen(true),
      closeSignInModal: () => setSignInModalOpen(false),
      signOut,
      consumePendingReturn,
      refreshProfile,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user, hydrated, isSignInModalOpen, pathname, pendingReturn]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** For pages that only make sense when signed in: redirects to `redirectTo`
 *  if the visitor turns out to be a guest, an admin-only page can pass
 *  `extraCheck` (e.g. `(user) => user.isAdmin`) to also gate on that. Waits
 *  for `hydrated` first — see the note on AuthContextValue.hydrated. */
export function useRequireAuthPage(redirectTo: string, extraCheck?: (user: User) => boolean): boolean {
  const { hydrated, status, user, requireAuth } = useAuth();
  const router = useRouter();
  const allowed = hydrated && status === "authed" && (!extraCheck || (user !== null && extraCheck(user)));

  useEffect(() => {
    if (!hydrated) return;
    const signedIn = requireAuth();
    if (!signedIn || (extraCheck && user && !extraCheck(user))) {
      router.replace(redirectTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, status]);

  return allowed;
}
