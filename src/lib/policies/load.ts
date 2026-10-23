import "server-only";
import fs from "node:fs";
import path from "node:path";
import * as OpenCC from "opencc-js";
import { isPolicySlug, type PolicySlug } from "./slugs";

// Reads the policy texts written by the team. English and Simplified Chinese
// are the official versions. Traditional Chinese is converted from Simplified
// (OpenCC, Taiwan wording). Every other language is shown the English text
// with a button that machine-translates it, labelled unofficial.

export interface PolicyDoc {
  slug: PolicySlug;
  title: string;
  version: string;
  updated: string;
  draft: boolean;
  body: string;
  /** Which written language the body is in. */
  written: "en" | "zh-CN";
  /** True when the body was converted from Simplified to Traditional. */
  converted: boolean;
  /** True when the reader's language has no official text (they see English, with the translate button). */
  needsTranslation: boolean;
}

const DIR = path.join(process.cwd(), "content", "policies");
const toTW = OpenCC.Converter({ from: "cn", to: "twp" });

function parse(raw: string) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  if (m) for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { meta, body: (m ? m[2] : raw).trim() };
}

function read(slug: PolicySlug, written: "en" | "zh-CN") {
  const file = path.join(DIR, `${slug}.${written}.md`);
  if (!fs.existsSync(file)) return null;
  return parse(fs.readFileSync(file, "utf8"));
}

export function loadPolicy(slugIn: string, lang: string): PolicyDoc | null {
  if (!isPolicySlug(slugIn)) return null;
  const slug = slugIn;
  const zh = lang === "zh-CN" || lang === "zh-TW";
  const written: "en" | "zh-CN" = zh && read(slug, "zh-CN") ? "zh-CN" : "en";
  const doc = read(slug, written) ?? read(slug, "en");
  if (!doc) return null;
  const converted = lang === "zh-TW" && written === "zh-CN";
  const text = (s: string) => (converted ? toTW(s) : s);
  return {
    slug,
    title: text(doc.meta.title ?? slug),
    version: doc.meta.version ?? "0",
    updated: doc.meta.updated ?? "",
    draft: (doc.meta.status ?? "draft") !== "final",
    body: text(doc.body),
    written,
    converted,
    needsTranslation: lang !== "en" && !zh,
  };
}

/** The English text and its version, the source for machine translation. */
export function loadEnglishPolicy(slug: string): { title: string; version: string; body: string } | null {
  if (!isPolicySlug(slug)) return null;
  const doc = read(slug, "en");
  return doc ? { title: doc.meta.title ?? slug, version: doc.meta.version ?? "0", body: doc.body } : null;
}

/** Splits a policy into pieces of at most `max` characters, at section starts where possible. */
export function splitPolicy(body: string, max = 3500): string[] {
  const sections = body.split(/\n(?=## )/);
  const out: string[] = [];
  let cur = "";
  for (const s of sections) {
    if (cur && cur.length + s.length + 1 > max) { out.push(cur); cur = ""; }
    cur = cur ? `${cur}\n${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}
