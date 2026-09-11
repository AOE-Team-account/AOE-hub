"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CURRENT_USER_ID, getUserById } from "@/lib/mock-data";
import type { User } from "@/lib/types";

// Mock auth for Phase 1 — no real accounts yet. Phase 2 (per the roadmap)
// swaps this for real Supabase auth; everything downstream should only
// depend on this context's shape, not on how signed-in state is stored.

interface AuthContextValue {
  status: "guest" | "authed";
  user: User | null;
  /** False until the mock-persisted auth state has been read from
   *  localStorage. Gated pages MUST wait for this before deciding whether
   *  to redirect a visitor away — otherwise a page's own mount effect can
   *  run (and redirect) before this provider's mount effect has had a
   *  chance to hydrate `status` from storage (child effects run before
   *  parent effects on mount), incorrectly bouncing an already-signed-in
   *  visitor on every hard refresh of a gated route. */
  hydrated: boolean;
  isSignInModalOpen: boolean;
  /** Returns true if already signed in; otherwise opens the sign-in modal
   *  and remembers where to return to, returning false so the caller can
   *  bail out of whatever gated action triggered this. */
  requireAuth: () => boolean;
  openSignInModal: () => void;
  closeSignInModal: () => void;
  /** Existing user path — skips onboarding, returns to wherever they were. */
  logIn: () => void;
  /** New user path — caller should navigate to /onboarding next. */
  startSignup: () => void;
  signOut: () => void;
  /** Consumes and clears the page to return to after onboarding/login. */
  consumePendingReturn: () => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "aoehub.authed";
const DEFAULT_RETURN = "/experience";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"guest" | "authed">("guest");
  const [hydrated, setHydrated] = useState(false);
  const [isSignInModalOpen, setSignInModalOpen] = useState(false);
  const [pendingReturn, setPendingReturn] = useState<string>(DEFAULT_RETURN);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Mock persistence only exists client-side (no real session/cookie yet
    // — see Phase 2), so this can't be read until after mount.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (stored === "1") setStatus("authed");
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, status === "authed" ? "1" : "0");
  }, [status]);

  const user = status === "authed" ? getUserById(CURRENT_USER_ID) ?? null : null;

  function requireAuth() {
    if (status === "authed") return true;
    setPendingReturn(pathname || DEFAULT_RETURN);
    setSignInModalOpen(true);
    return false;
  }

  function logIn() {
    setStatus("authed");
    setSignInModalOpen(false);
    const target = pendingReturn || DEFAULT_RETURN;
    setPendingReturn(DEFAULT_RETURN);
    router.push(target);
  }

  function startSignup() {
    setStatus("authed");
    setSignInModalOpen(false);
    router.push("/onboarding");
  }

  function signOut() {
    setStatus("guest");
    router.push("/");
  }

  function consumePendingReturn() {
    const target = pendingReturn || DEFAULT_RETURN;
    setPendingReturn(DEFAULT_RETURN);
    return target;
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
      logIn,
      startSignup,
      signOut,
      consumePendingReturn,
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
 *  for `hydrated` first — see the note on AuthContextValue.hydrated.
 *
 *  Returns `ready`: false while hydration is pending OR a redirect has just
 *  been triggered, so the page can render nothing instead of flashing
 *  gated content for a frame before the redirect takes effect. */
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
