import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase/config";

// Runs on every request (see matcher below) to refresh the Supabase auth
// session before it expires. Named `proxy` rather than `middleware` — the
// Next.js 16 convention (this project's node_modules/next has a breaking
// rename here; see the AGENTS.md note at the repo root).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // Triggers a refresh if the session is expired; setAll above writes the
  // renewed cookies onto `response`. Must happen before any route code runs.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimization — proxy is invoked on
    // every request otherwise, per the Next.js docs' own recommendation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
