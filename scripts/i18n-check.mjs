#!/usr/bin/env node
// Checks the interface strings: same keys in all three files, same {placeholders}
// in every language, and every t("key") used in the source exists.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "src", "lib", "i18n");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const tables = { en: load("en.json"), "zh-CN": load("zh-CN.json"), "zh-TW": load("zh-TW.json") };
const problems = [];
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const key of Object.keys(tables.en)) {
  for (const lang of ["zh-CN", "zh-TW"]) {
    if (!(key in tables[lang])) problems.push(`${lang} is missing "${key}"`);
    else if (ph(tables[lang][key]) !== ph(tables.en[key])) problems.push(`${lang} "${key}" has different {placeholders}`);
    else if (!tables[lang][key].trim()) problems.push(`${lang} "${key}" is empty`);
  }
}
for (const lang of ["zh-CN", "zh-TW"]) for (const key of Object.keys(tables[lang])) if (!(key in tables.en)) problems.push(`${lang} has extra key "${key}"`);

function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])); }
const used = new Set();
for (const f of walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/\bt\(\s*["']([\w.-]+)["']/g)) used.add(m[1]);
}
for (const k of used) if (!(k in tables.en)) problems.push(`code uses unknown key "${k}"`);
const unused = Object.keys(tables.en).filter((k) => !used.has(k));
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`i18n ok: ${Object.keys(tables.en).length} keys, ${used.size} used in code${unused.length ? `, ${unused.length} not used by a literal t("…") call (may be dynamic)` : ""}`);
