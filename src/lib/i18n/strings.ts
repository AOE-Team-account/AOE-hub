import en from "./en.json";
import zhCN from "./zh-CN.json";
import zhTW from "./zh-TW.json";

// The hub's interface text. English is the master: every key lives in en.json
// and the two Chinese files must have exactly the same keys (the build fails
// if one is missing). Values may contain {placeholders} that t() fills in.
//
// English, Simplified and Traditional Chinese are the three languages written
// out here. Traditional is produced from Simplified by the standard OpenCC
// converter (scripts/sync-zh-tw.mjs) and is meant to be proof-read by a
// native speaker before launch. Every other language is added automatically
// by AI and kept in the database (see the i18n API), never in these files.

export type UiKey = keyof typeof en;
type Table = Record<UiKey, string>;

// Compile-time guard: these assignments fail the build if a key is missing.
const enTable: Table = en;
const zhCNTable: Table = zhCN;
const zhTWTable: Table = zhTW;

export const STATIC_LANGUAGES = ["en", "zh-CN", "zh-TW"] as const;
export type StaticLanguage = (typeof STATIC_LANGUAGES)[number];

export const STATIC_TABLES: Record<StaticLanguage, Table> = {
  en: enTable,
  "zh-CN": zhCNTable,
  "zh-TW": zhTWTable,
};

export function isStaticLanguage(code: string): code is StaticLanguage {
  return (STATIC_LANGUAGES as readonly string[]).includes(code);
}

export type TParams = Record<string, string | number>;

export function format(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Looks a key up in a language, falling back to English. */
export function translateKey(table: Partial<Table> | undefined, key: UiKey, params?: TParams): string {
  return format(table?.[key] ?? enTable[key], params);
}

export const LANGUAGE_NAMES: Record<StaticLanguage, string> = {
  en: "English",
  "zh-CN": "中文（简体）",
  "zh-TW": "中文（繁體）",
};

/** Maps a browser language such as "zh-HK" or "en-GB" to one of the three written languages, if any. */
export function matchStaticLanguage(browserTag: string): StaticLanguage | null {
  const tag = browserTag.toLowerCase();
  if (tag.startsWith("zh")) {
    if (/hant|tw|hk|mo/.test(tag)) return "zh-TW";
    return "zh-CN";
  }
  if (tag.startsWith("en")) return "en";
  return null;
}
