// Render the PNG app icons from the logo (web/public/favicon.svg, drawn by scripts/logo.py) with
// the bundled Chromium. Usage: node scripts/icons.mjs
//
// Every icon is the full square, edge to edge: the "o" is meant to be cut by the edge, and the
// platforms round the corners (iOS) or crop to their own shape (Android's maskable icons) themselves.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("web/public/favicon.svg", "utf8");

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(`web/public/icons/${name}`, await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
}
await browser.close();
console.log("icons written to web/public/icons");
