import "server-only";
import { cookies, headers } from "next/headers";
import { STATIC_TABLES, isStaticLanguage, matchStaticLanguage, translateKey, type StaticLanguage, type TParams, type UiKey } from "./strings";

export const LANG_COOKIE = "aoehub.lang";

/**
 * The language for this request: the visitor's saved choice (cookie), else the
 * first of their browser's languages that we have written out, else English.
 * Languages added by AI are handled on the client (they live in the database).
 */
export async function getRequestLanguage(): Promise<{ lang: string; fromBrowser: boolean; browserTag: string | null }> {
  const jar = await cookies();
  const saved = jar.get(LANG_COOKIE)?.value;
  if (saved && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(saved)) return { lang: saved, fromBrowser: false, browserTag: null };

  const accept = (await headers()).get("accept-language") ?? "";
  const tags = accept.split(",").map((p) => p.split(";")[0].trim()).filter(Boolean);
  for (const tag of tags) {
    const match = matchStaticLanguage(tag);
    if (match) return { lang: match, fromBrowser: true, browserTag: tag };
  }
  return { lang: "en", fromBrowser: true, browserTag: tags[0] ?? null };
}

/** For server components: returns a t() in the request's language (English for AI-added languages until they load). */
export async function getServerT() {
  const { lang } = await getRequestLanguage();
  const table = isStaticLanguage(lang) ? STATIC_TABLES[lang as StaticLanguage] : undefined;
  return { lang, t: (key: UiKey, params?: TParams) => translateKey(table, key, params) };
}
