// Renders og-image.png (13 §8) from the site's tokens, fonts and turtle still. Run once when the
// positioning or the logo changes: node scripts/og.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
// A page set from a string can't load file:// URLs, so embed the assets.
const data = async (path, type) => `data:${type};base64,${(await readFile(new URL(path, root))).toString("base64")}`;
const heading = await data("assets/fonts/manrope-latin-800-normal.woff2", "font/woff2");
const body = await data("assets/fonts/source-sans-3-latin-600-normal.woff2", "font/woff2");
const turtle = await data("assets/brand/turtle-still.webp", "image/webp");
const html = `<!doctype html><html><head><style>
@font-face { font-family: Manrope; src: url(${heading}); font-weight: 800; }
@font-face { font-family: "Source Sans 3"; src: url(${body}); font-weight: 600; }
body { margin: 0; width: 1200px; height: 630px; background: #faf7f2; color: #1b2a2f;
  font-family: "Source Sans 3"; display: flex; flex-direction: column; justify-content: center; padding: 0 96px; box-sizing: border-box; }
img { width: 158px; height: 128px; margin-bottom: 36px; }
h1 { font: 800 88px/1 Manrope; margin: 0 0 24px; letter-spacing: -0.02em; }
p { font-weight: 600; font-size: 38px; line-height: 1.3; margin: 0; color: #1f5f5b; max-width: 1010px; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: #1f5f5b; }
.bar::after { content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 180px; background: #b4462f; }
</style></head><body>
<img src="${turtle}" alt="">
<h1>Som Ruge</h1>
<p>Product Management and AI / Digital Transformation Leader</p>
<div class="bar"></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("og-image.png", root).pathname });
await browser.close();
console.log("og-image.png written");
