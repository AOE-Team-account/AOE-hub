import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { hubChat } from "@/lib/ai/server/hub-ai";
import { STATIC_LANGUAGES, isStaticLanguage } from "@/lib/i18n/strings";
import en from "@/lib/i18n/en.json";
import { maxAiLanguages, newLanguageCap, refundBudget, takeBudget } from "./budget";
import { LANG_PATTERN, englishNameOf } from "./languages";

// Languages beyond the three written ones. A visitor names a language; the AI
// identifies it, then translates every interface string of the hub into it, a
// few dozen at a time. The result is kept in the database, labelled as
// machine-translated, and reviewed by a person only if the hub later chooses
// to promote it into the written files.

const EN = en as Record<string, string>;
const KEYS = Object.keys(EN);
const CHUNK = 40;

export interface LanguageState {
  code: string;
  englishName: string;
  nativeName: string;
  status: "building" | "ready" | "failed";
  done: number;
  total: number;
}

function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function rowToState(r: Record<string, unknown>): LanguageState {
  return {
    code: r.code as string,
    englishName: r.english_name as string,
    nativeName: r.native_name as string,
    status: r.status as LanguageState["status"],
    done: r.done_keys as number,
    total: r.total_keys as number,
  };
}

export async function listReadyLanguages(): Promise<{ code: string; label: string }[]> {
  const { data } = await createServiceRoleClient().from("ui_languages").select("code, native_name").eq("status", "ready").order("english_name");
  return ((data ?? []) as { code: string; native_name: string }[]).map((r) => ({ code: r.code, label: r.native_name }));
}

export async function getUiStrings(lang: string): Promise<Record<string, string> | null> {
  if (!LANG_PATTERN.test(lang) || isStaticLanguage(lang)) return null;
  const svc = createServiceRoleClient();
  const { data: row } = await svc.from("ui_languages").select("status").eq("code", lang).maybeSingle();
  if (!row || row.status !== "ready") return null;
  const out: Record<string, string> = {};
  // 1000 rows is the API's page size; the interface has a few hundred strings.
  const { data } = await svc.from("ui_strings").select("key, value").eq("lang", lang).limit(5000);
  for (const r of (data ?? []) as { key: string; value: string }[]) out[r.key] = r.value;
  return out;
}

export type AddResult =
  | { ok: true; language: LanguageState; existing: boolean }
  | { ok: false; error: string; code?: string };

/** Identify the language a visitor named, and start building it. */
export async function addLanguage(rawName: string): Promise<AddResult> {
  const name = rawName.trim().slice(0, 60);
  if (name.length < 2 || !/\p{L}/u.test(name)) return { ok: false, error: "Please type the name of a language." };

  const svc = createServiceRoleClient();

  // Ask the AI what language this is. Cheap, and it also catches nonsense.
  type Ident = { valid?: boolean; code?: string; english?: string; native?: string };
  let ident = null as Ident | null;
  try {
    const reply = await hubChat(
      [
        {
          role: "system",
          content: [
            "You identify human languages. The user typed the name of a language, in any language or spelling, possibly misspelled.",
            'Reply with JSON only: {"valid":true,"code":"<shortest standard BCP-47 code, e.g. ja, es, pt-BR, ar>","english":"<name in English>","native":"<name in that language itself>"}',
            'If it is not a real living human language people read, reply {"valid":false}.',
            "For Chinese, use zh-CN for Simplified and zh-TW for Traditional.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify({ language: name }) },
      ],
      { maxTokens: 200, temperature: 0 }
    );
    ident = parseJson(reply.text) as Ident | null;
  } catch {
    return { ok: false, error: "The translation service is busy right now. Please try again in a little while." };
  }
  if (!ident?.valid || typeof ident.code !== "string" || !LANG_PATTERN.test(ident.code)) {
    return { ok: false, error: "I could not recognise that language. Please check the spelling." };
  }
  let code = ident.code;
  // The runtime must also know the code, as a check on the AI's answer.
  try {
    if (new Intl.DisplayNames(["en"], { type: "language" }).of(code) === code) throw new Error("unknown");
  } catch {
    return { ok: false, error: "I could not recognise that language. Please check the spelling." };
  }
  if (code.toLowerCase() === "zh") code = "zh-CN";
  if (isStaticLanguage(code)) return { ok: false, error: "That language is already available.", code };
  if (code.toLowerCase().startsWith("en")) return { ok: false, error: "That language is already available.", code: "en" };

  const { data: existing } = await svc.from("ui_languages").select("*").eq("code", code).maybeSingle();
  if (existing) {
    if (existing.status === "failed") {
      await svc.from("ui_languages").update({ status: "building", done_keys: 0 }).eq("code", code);
      return { ok: true, language: { ...rowToState(existing), status: "building", done: 0 }, existing: false };
    }
    return { ok: true, language: rowToState(existing), existing: true };
  }

  const { count } = await svc.from("ui_languages").select("code", { count: "exact", head: true });
  if ((count ?? 0) >= (await maxAiLanguages())) {
    return { ok: false, error: "The hub already has as many extra languages as it can keep for now." };
  }
  if (!(await takeBudget("language", 1, await newLanguageCap()))) {
    return { ok: false, error: "Too many new languages have been added today. Please try again tomorrow." };
  }

  const row = {
    code,
    english_name: (ident.english || englishNameOf(code)).slice(0, 80),
    native_name: (ident.native || ident.english || code).slice(0, 80),
    status: "building",
    done_keys: 0,
    total_keys: KEYS.length,
  };
  const { error } = await svc.from("ui_languages").insert(row);
  if (error) {
    await refundBudget("language", 1);
    // Lost a race with someone adding the same language: use theirs.
    const { data: again } = await svc.from("ui_languages").select("*").eq("code", code).maybeSingle();
    if (again) return { ok: true, language: rowToState(again), existing: true };
    return { ok: false, error: "Could not add that language. Please try again." };
  }
  return { ok: true, language: rowToState({ ...row }), existing: false };
}

const PLACEHOLDERS = /\{\w+\}/g;
const TAGS = /<\/?\w+>/g;
const sameSet = (a: string | null, b: string | null, re: RegExp) => {
  const x = (a?.match(re) ?? []).sort().join("|");
  const y = (b?.match(re) ?? []).sort().join("|");
  return x === y;
};

/** Translates the next block of interface strings. Returns the new state. */
export async function buildStep(code: string): Promise<{ ok: true; language: LanguageState } | { ok: false; error: string }> {
  const svc = createServiceRoleClient();
  const { data: row } = await svc.from("ui_languages").select("*").eq("code", code).maybeSingle();
  if (!row) return { ok: false, error: "Unknown language." };
  if (row.status !== "building") return { ok: true, language: rowToState(row) };

  const start = row.done_keys as number;
  const keys = KEYS.slice(start, start + CHUNK);
  if (keys.length === 0) {
    await svc.from("ui_languages").update({ status: "ready" }).eq("code", code);
    return { ok: true, language: { ...rowToState(row), status: "ready" } };
  }

  const input: Record<string, string> = {};
  for (const k of keys) input[k] = EN[k];
  let out: Record<string, unknown> | null = null;
  try {
    const reply = await hubChat(
      [
        {
          role: "system",
          content: [
            `You translate the interface text of an education community website from English into ${row.english_name} (${code}).`,
            "The user message is a JSON object of key to English text. Reply with JSON only: the same keys, each with its translation.",
            "Rules: keep every {placeholder} exactly as written (do not translate or move the braces' contents); keep <b>...</b>-style tags and their text order sensible; keep brand names (AOEhub) and the role names Creator, Watcher, Deacon, Answerer, Verified in English; keep emoji, symbols and the ellipsis; use a warm, plain, respectful tone for parents and families.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      { maxTokens: 6000, temperature: 0.2 }
    );
    out = parseJson(reply.text) as Record<string, unknown> | null;
  } catch {
    return { ok: false, error: "The translation service is busy right now. It will carry on in a moment." };
  }
  if (!out) return { ok: false, error: "The translation service gave an unusable answer. It will try again." };

  const good: { lang: string; key: string; value: string }[] = [];
  for (const k of keys) {
    const v = out[k];
    if (typeof v !== "string" || !v.trim()) continue;
    if (!sameSet(EN[k], v, PLACEHOLDERS) || !sameSet(EN[k], v, TAGS)) continue; // keep English for this one
    good.push({ lang: code, key: k, value: v });
  }
  if (good.length) {
    const { error } = await svc.from("ui_strings").upsert(good, { onConflict: "lang,key" });
    if (error) return { ok: false, error: "Could not save the translation. It will try again." };
  }
  const done = start + keys.length;
  const status = done >= KEYS.length ? "ready" : "building";
  await svc.from("ui_languages").update({ done_keys: Math.max(done, start), status }).eq("code", code);
  return { ok: true, language: { ...rowToState(row), done, status } };
}

export { STATIC_LANGUAGES };
