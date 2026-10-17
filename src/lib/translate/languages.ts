import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { LANGUAGE_NAMES, isStaticLanguage } from "@/lib/i18n/strings";

const ENGLISH_NAMES: Record<string, string> = {
  en: "English",
  "zh-CN": "Simplified Chinese (简体中文)",
  "zh-TW": "Traditional Chinese (繁體中文)",
};

export const LANG_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export function englishNameOf(code: string, known?: string): string {
  if (ENGLISH_NAMES[code]) return ENGLISH_NAMES[code];
  if (known) return known;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function nativeNameOf(code: string, known?: string): string {
  if (isStaticLanguage(code)) return LANGUAGE_NAMES[code];
  return known ?? code;
}

/** A language we can translate into: one of the three written ones, or an AI-added one that is ready. */
export async function languageIsAvailable(code: string): Promise<{ ok: boolean; englishName: string }> {
  if (!LANG_PATTERN.test(code)) return { ok: false, englishName: code };
  if (isStaticLanguage(code)) return { ok: true, englishName: englishNameOf(code) };
  const { data } = await createServiceRoleClient()
    .from("ui_languages")
    .select("english_name, status")
    .eq("code", code)
    .maybeSingle();
  if (data && data.status === "ready") return { ok: true, englishName: englishNameOf(code, data.english_name as string) };
  return { ok: false, englishName: code };
}
