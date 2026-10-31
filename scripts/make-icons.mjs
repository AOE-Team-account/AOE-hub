#!/usr/bin/env node
// Makes the home-screen icons and the link-share picture from the logo.
//   node scripts/make-icons.mjs        (reads public/brand/logo.png)
// Writes: src/app/icon.png, src/app/apple-icon.png, src/app/opengraph-image.png,
//         src/app/twitter-image.png, public/icons/icon-192.png, public/icons/icon-512.png
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(path.join(root, "package.json"))("sharp");
const logo = path.join(root, "public", "brand", "logo.png");
const BG = "#F5F7F2"; // the hub's page background
const out = (...p) => path.join(root, ...p);

async function square(size, file, background) {
  const pad = Math.round(size * 0.08);
  const inner = await sharp(logo).resize(size - pad * 2, size - pad * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: inner, gravity: "centre" }]);
  await img.png().toFile(file);
}
await square(512, out("src/app/icon.png"));
await square(180, out("src/app/apple-icon.png"), "#ffffff"); // iPhones turn transparency black, so this one is on white
await square(192, out("public/icons/icon-192.png"));
await square(512, out("public/icons/icon-512.png"));

const w = 1200, h = 630;
const mark = await sharp(logo).resize({ height: 500, fit: "inside" }).png().toBuffer();
const card = sharp({ create: { width: w, height: h, channels: 4, background: BG } }).composite([{ input: mark, gravity: "centre" }]).png();
await card.toFile(out("src/app/opengraph-image.png"));
await sharp(out("src/app/opengraph-image.png")).toFile(out("src/app/twitter-image.png"));
console.log("icons written");
