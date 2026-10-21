import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Where the links in the hub's emails land (password reset, email
// confirmation). It exchanges the link's one-time token for a sign-in, then
// sends the person on to `next`. Works both for links that carry a token_hash
// (the same device is not required) and for the standard `code` links.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  // Only ever go to a page on this site.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  return NextResponse.redirect(ok ? `${origin}${next}` : `${origin}/forgot-password?expired=1`);
}
