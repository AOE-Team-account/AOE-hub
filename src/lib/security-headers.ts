// The Content-Security-Policy for hub pages: a list of the only places
// scripts, images, frames and connections may come from. A script injected
// by an attacker is not on the list, so the browser refuses to run it.
// (Hosted games on the "play." address get their own, separate policy in
// src/app/play/[assetId]/[[...path]]/route.ts.)
import { supabaseUrl } from "@/lib/supabase/config";

function origin(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

// The address comes from the visitor's request, so only a plain address
// (letters, digits, dots, hyphens and a port) may be copied into the policy.
export const isPlainHost = (host: string) => /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{1,5})?$/i.test(host);

// The private file store's address: pictures and videos in posts are sent
// there by a short-lived link, and uploads go straight to it. Exactly our own
// account when known, so a bucket belonging to someone else is never allowed.
function fileStoreOrigin(): string {
  const id = (process.env.R2_ACCOUNT_ID ?? "").trim();
  return /^[a-z0-9]{8,64}$/i.test(id) ? `https://${id}.r2.cloudflarestorage.com` : "https://*.r2.cloudflarestorage.com";
}

export function buildCsp(nonce: string, host: string, proto: string): string {
  const dev = process.env.NODE_ENV === "development";
  const sb = origin(supabaseUrl);
  const sbWs = sb ? sb.replace(/^http/, "ws") : null;
  // The only addresses the hub's own pages may be asked to call: itself, the
  // database/sign-in service, and the private file store (members upload
  // straight into it with a short-lived signed address).
  const store = fileStoreOrigin();
  const connect = ["'self'", sb, sbWs, store, dev ? "ws:" : null].filter(Boolean);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${store}`,
    `media-src 'self' blob: ${store}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    // Hosted games are shown from the separate "play." address.
    isPlainHost(host) && (proto === "http" || proto === "https") ? `frame-src 'self' ${proto}://play.${host}` : "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
