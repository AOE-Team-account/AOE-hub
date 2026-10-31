import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getR2Object } from "@/lib/storage/r2";
import { mimeFor } from "@/lib/games";
import { verifyGameToken } from "@/lib/game-token";
import { isPlainHost } from "@/lib/security-headers";

export const runtime = "nodejs";

// Serves the files of a hosted game. This is only ever reachable on the
// separate "play." address (never on the hub's own address), because the code
// of a game is written by a member and must never run where visitors are
// signed in. Only games that passed the malware check are served.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Plain answers (not found / sign in) carry the same safety headers as the games.
const PLAIN_HEADERS = {
  "cache-control": "no-store",
  "content-type": "text/plain; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: PLAIN_HEADERS });
}

export async function GET(request: Request, { params }: RouteContext<"/play/[assetId]/[[...path]]">) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!host.startsWith("play.")) return notFound();
  const { assetId, path } = await params;
  if (!UUID.test(assetId)) return notFound();

  // The first part of the path is the signed token handed out to signed-in members.
  const [token, ...rest] = path ?? [];
  if (!token || !verifyGameToken(assetId, token)) {
    return new NextResponse("Sign in to AOEhub to play.", { status: 401, headers: PLAIN_HEADERS });
  }

  const segments = rest.map((s) => decodeURIComponent(s));
  if (segments.some((s) => s === ".." || s === "." || s.includes("\\") || s.includes("\0"))) return notFound();
  const rel = segments.length ? segments.join("/") : "index.html";

  const svc = createServiceRoleClient();
  const { data: asset } = await svc
    .from("file_assets")
    .select("is_game, game_prefix, scan_status, file_post_id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset || !asset.is_game || !asset.game_prefix || asset.scan_status !== "clean") return notFound();
  const { data: post } = await svc.from("file_posts").select("deleted_at, author_id").eq("id", asset.file_post_id).maybeSingle();
  if (!post || post.deleted_at) return notFound();
  const { data: author } = await svc.from("profiles").select("account_status").eq("id", post.author_id).maybeSingle();
  if (!author || author.account_status !== "active") return notFound();

  const range = request.headers.get("range") ?? undefined;
  let object;
  try {
    object = await getR2Object(asset.game_prefix + rel, range);
  } catch {
    return notFound();
  }
  if (!object.Body) return notFound();

  // Where the hub itself lives (play.example.com -> example.com): only it may frame the game.
  const proto = request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const hubHost = host.replace(/^play\./, "");
  // Only a plain address may be copied into the policy; anything odd means nobody may frame the game.
  const hubOrigin = isPlainHost(hubHost) && (proto === "http" || proto === "https") ? `${proto}://${hubHost}` : "'none'";
  const headers = new Headers({
    "content-type": mimeFor(rel),
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": "private, max-age=300",
    // The game can only talk to its own files: no outside scripts, no calling out.
    "content-security-policy": [
      "default-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      `frame-ancestors ${hubOrigin}`,
      "sandbox allow-scripts allow-same-origin allow-pointer-lock allow-modals",
    ].join("; "),
  });
  if (object.ContentLength !== undefined) headers.set("content-length", String(object.ContentLength));
  if (object.ContentRange) headers.set("content-range", object.ContentRange);
  headers.set("accept-ranges", "bytes");
  const body = (object.Body as unknown as { transformToWebStream: () => ReadableStream }).transformToWebStream();
  return new Response(body, { status: object.ContentRange ? 206 : 200, headers });
}
