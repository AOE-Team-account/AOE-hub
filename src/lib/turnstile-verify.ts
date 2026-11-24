import "server-only";

// Server-side check of a Cloudflare Turnstile token (AOE-SEC-06, SEC-17), for the
// hub's own forms that do not go through Supabase Auth (e.g. the takedown form).
// It is OFF until TURNSTILE_SECRET_KEY is set in the host's settings; then a
// missing or bad token is refused. (Sign-up, sign-in and password reset are
// checked by Supabase itself once its bot protection is switched on.)
const SECRET = process.env.TURNSTILE_SECRET_KEY ?? "";

export const turnstileRequired = SECRET !== "";

export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
  if (!turnstileRequired) return true;
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return false;
  try {
    const body = new URLSearchParams({ secret: SECRET, response: token });
    if (ip && ip !== "unknown" && !ip.includes("/")) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
