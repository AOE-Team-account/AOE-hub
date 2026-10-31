import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase/config";
import { isPrivateSite } from "@/lib/site-private";
import { buildCsp, newNonce } from "@/lib/security-headers";

// Runs on every request (see matcher below) to refresh the Supabase auth
// session before it expires. Named `proxy` rather than `middleware` — the
// Next.js 16 convention (this project's node_modules/next has a breaking
// rename here; see the AGENTS.md note at the repo root).
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const privateSite = isPrivateSite();
  // The game address never handles sign-in; nothing there may touch a session.
  // (Its own security headers are set by the game route.)
  if (host.startsWith("play.")) {
    const res = NextResponse.next();
    if (privateSite) res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return res;
  }

  // A fresh random nonce for every page view: only scripts carrying it may run.
  const nonce = newNonce();
  const proto = request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const csp = buildCsp(nonce, host, proto);
  // Next reads the nonce from the request's own Content-Security-Policy header
  // and puts it on its scripts. Built fresh each time so renewed sign-in
  // cookies (set below) are carried along.
  const forward = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };
  let response = forward();

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forward();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // Triggers a refresh if the session is expired; setAll above writes the
  // renewed cookies onto `response`. Must happen before any route code runs.
  await supabase.auth.getClaims();

  response.headers.set("Content-Security-Policy", csp);
  if (privateSite) response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimization — proxy is invoked on
    // every request otherwise, per the Next.js docs' own recommendation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
