"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// Cloudflare Turnstile: a free, privacy-friendly "are you a person?" check
// (usually invisible; it only asks when it is unsure). It protects sign-up,
// sign-in and password reset from bots. It is OFF until the site key is set
// in NEXT_PUBLIC_TURNSTILE_SITE_KEY; the same key is then switched on in
// Supabase (Authentication → Bot and Abuse Protection), which checks every
// token on its own server, so a bot cannot skip the widget.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}
declare global { interface Window { turnstile?: TurnstileApi; __turnstileLoading?: Promise<void> } }

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  window.__turnstileLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { window.__turnstileLoading = undefined; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return window.__turnstileLoading;
}

/** `widget` goes inside the form; `token` is passed to Supabase as captchaToken;
 *  `ready` is false while a check is still needed; call `reset()` after each attempt
 *  (a token works only once). When no site key is set, everything is a no-op. */
export function useTurnstile(): { enabled: boolean; ready: boolean; token: string | undefined; reset: () => void; widget: ReactNode } {
  const enabled = SITE_KEY !== "";
  const [token, setToken] = useState<string | undefined>(undefined);
  const box = useRef<HTMLDivElement | null>(null);
  const id = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    loadScript().then(() => {
      if (gone || !box.current || !window.turnstile || id.current) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(undefined),
        "error-callback": () => setToken(undefined),
      });
    }).catch(() => { /* blocked or offline: the form stays disabled until it works */ });
    return () => {
      gone = true;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, [enabled]);

  const reset = useCallback(() => {
    setToken(undefined);
    if (id.current && window.turnstile) window.turnstile.reset(id.current);
  }, []);

  const widget = enabled ? <div ref={box} style={{ marginTop: 14, minHeight: 4 }} /> : null;
  return { enabled, ready: !enabled || token !== undefined, token, reset, widget };
}
