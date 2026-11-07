// Render the PNG app icons from SVG with the bundled Chromium. Usage: node scripts/icons.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const icon = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" ${pad ? "" : 'rx="14"'} fill="#000000"/>
  <g transform="translate(32 32) scale(${pad ? 0.72 : 1}) translate(-32 -32)">
    <rect x="14" y="16" width="36" height="28" rx="8" fill="#ffffff"/>
    <rect x="19" y="21" width="11" height="9" rx="2" fill="#000000"/>
    <rect x="34" y="21" width="11" height="9" rx="2" fill="#000000"/>
    <circle cx="22" cy="38" r="2.5" fill="#000000"/>
    <circle cx="42" cy="38" r="2.5" fill="#000000"/>
    <path d="M20 44 L14 52 M44 44 L50 52" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon(pad).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(`web/public/icons/${name}`, await page.screenshot({ omitBackground: !pad, clip: { x: 0, y: 0, width: size, height: size } }));
}
await browser.close();
console.log("icons written to web/public/icons");
