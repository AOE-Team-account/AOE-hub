#!/usr/bin/env node
// Changes the wording of strings that already exist (i18n-add.mjs never overwrites).
//   node scripts/i18n-set.mjs batch.json   ([{ "key", "en", "zh" }])
// Traditional is regenerated from the Simplified text with OpenCC (Taiwan wording).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "i18n");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const save = (f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o, null, 2) + "\n");
const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
const [en, cn, tw] = [load("en.json"), load("zh-CN.json"), load("zh-TW.json")];
let n = 0;
for (const row of JSON.parse(fs.readFileSync(process.argv[2], "utf8"))) {
  if (!(row.key in en)) throw new Error("Unknown key: " + row.key);
  en[row.key] = row.en; cn[row.key] = row.zh; tw[row.key] = row.tw ?? toTW(row.zh); n++;
}
save("en.json", en); save("zh-CN.json", cn); save("zh-TW.json", tw);
console.log(`updated ${n}`);
