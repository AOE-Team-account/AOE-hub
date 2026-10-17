#!/usr/bin/env node
// Adds interface strings to the three written languages.
//   node scripts/i18n-add.mjs batch.json
// batch.json: [{ "key": "area.name", "en": "...", "zh": "简体中文..." }, ...]
// "zh" is Simplified Chinese; Traditional is made from it with OpenCC
// (Taiwan wording) unless a "tw" field is given. Existing keys are never
// overwritten (edit the JSON files by hand to change a string).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "i18n");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const save = (f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o, null, 2) + "\n");
const toTW = OpenCC.Converter({ from: "cn", to: "twp" });

const [en, cn, tw] = [load("en.json"), load("zh-CN.json"), load("zh-TW.json")];
const batch = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let added = 0, skipped = 0;
for (const row of batch) {
  if (!row.key || row.en == null || row.zh == null) throw new Error("Bad row: " + JSON.stringify(row));
  if (row.key in en) { skipped++; continue; }
  en[row.key] = row.en; cn[row.key] = row.zh; tw[row.key] = row.tw ?? toTW(row.zh); added++;
}
save("en.json", en); save("zh-CN.json", cn); save("zh-TW.json", tw);
console.log(`added ${added}, skipped ${skipped} (already present). Total keys: ${Object.keys(en).length}`);
