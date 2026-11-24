import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { rateLimitedShared } from "@/lib/ai/server/rate-limit";
import { hubChat } from "@/lib/ai/server/hub-ai";
import { AIProviderError } from "@/lib/ai/server/chat-providers";
import { languageIsAvailable } from "@/lib/translate/languages";
import { contentCap, refundBudget, takeBudget } from "@/lib/translate/budget";
import { loadEnglishPolicy, splitPolicy } from "@/lib/policies/load";
import { isPolicySlug } from "@/lib/policies/slugs";
import { clientIp } from "@/lib/client-ip";

export const runtime = "nodejs";

// "Translate into my language" on a policy page: POST { slug, lang }. The
// English text is split into pieces, each translated by the hub AI and kept
// (per language and per version), so a page is translated once for everyone.
// The result is shown as an unofficial translation.
export async function POST(request: Request) {
  let body: { slug?: unknown; lang?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  const lang = typeof body.lang === "string" ? body.lang : "";
  const policy = isPolicySlug(slug) ? loadEnglishPolicy(slug) : null;
  if (!policy) return NextResponse.json({ error: "Unknown page." }, { status: 400 });
  const available = await languageIsAvailable(lang);
  if (!available.ok || lang === "en" || lang.startsWith("zh")) return NextResponse.json({ error: "Unknown language." }, { status: 400 });

  const ip = clientIp(request);
  if (await (ip ? rateLimitedShared(`pt:ip:${ip}`, 12, 60_000) : rateLimitedShared("pt:noip", 30, 60_000))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const itemId = `${slug}@${policy.version}`;
  const pieces = [`# ${policy.title}`, ...splitPolicy(policy.body)];
  const hashes = pieces.map((p) => createHash("sha1").update(p).digest("hex").slice(0, 16));
  const svc = createServiceRoleClient();

  const { data: cached } = await svc
    .from("content_translations")
    .select("field, source_hash, translated")
    .eq("item_type", "policy")
    .eq("item_id", itemId)
    .eq("target_lang", lang);
  const have = new Map<string, { hash: string; text: string | null }>();
  for (const r of (cached ?? []) as { field: string; source_hash: string; translated: string | null }[]) have.set(r.field, { hash: r.source_hash, text: r.translated });

  const out: (string | null)[] = pieces.map((_, i) => {
    const hit = have.get(`p${i}`);
    return hit && hit.hash === hashes[i] && hit.text ? hit.text : null;
  });
  const missing = out.map((t, i) => (t === null ? i : -1)).filter((i) => i >= 0);

  if (missing.length > 0) {
    if (!(await takeBudget("content", missing.length, await contentCap()))) return NextResponse.json({ status: "paused" });
    let failed = 0;
    const system = [
      `You translate the legal and community policy pages of an education website into ${available.englishName}.`,
      `The text is Markdown. Keep the Markdown structure exactly: headings (#, ##), "-" lists, tables, ">" notes, **bold**, and links.`,
      `Text inside double square brackets, like [[this]], marks a gap still to be filled in: keep the double brackets and translate the words inside.`,
      `Do not translate or change email addresses, web addresses, link targets (the part in parentheses), or the names AOEhub, AOE Team, Creator, Watcher, Deacon, Answerer, Verified.`,
      `Translate faithfully and completely. Do not summarise, explain, soften or add anything. Reply with the translated Markdown only.`,
    ].join("\n");
    for (const i of missing) {
      try {
        const reply = await hubChat(
          [{ role: "system", content: system }, { role: "user", content: pieces[i] }],
          { maxTokens: Math.min(8192, Math.round(pieces[i].length * 2.2) + 400), temperature: 0.1 }
        );
        const text = reply.text.trim().replace(/^```(?:markdown)?\n/, "").replace(/\n```$/, "");
        // A reply many times longer or much shorter than the original went off track.
        if (!text || text.length > pieces[i].length * 5 + 300 || text.length < pieces[i].length * 0.15) { failed++; continue; }
        out[i] = text;
        await svc.from("content_translations").upsert(
          { item_type: "policy", item_id: itemId, field: `p${i}`, target_lang: lang, source_hash: hashes[i], source_lang: "en", translated: text, method: "ai" },
          { onConflict: "item_type,item_id,field,target_lang" }
        );
      } catch (err) {
        failed++;
        if (!(err instanceof AIProviderError)) console.error("Policy translation failed:", err instanceof Error ? err.message : err);
        else if (err.status === 429 || err.status === undefined || err.status >= 500) {
          // The AI is busy; stop here rather than try every remaining piece.
          failed += missing.length - missing.indexOf(i) - 1;
          break;
        }
      }
    }
    await refundBudget("content", failed);
    if (out.some((t) => t === null)) return NextResponse.json({ status: failed > 0 ? "paused" : "error" });
  }

  const [title, ...rest] = out as string[];
  return NextResponse.json({ status: "ok", title: title.replace(/^#\s*/, ""), text: rest.join("\n\n") });
}
