// Renders the PNotes project picture (assets/brand/pnotes.webp and pnotes-600.webp) in the style of the
// other project pictures, from the site's colours and fonts. Run once when the picture should change:
// node scripts/pnotes-cover.mjs
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
// A page set from a string can't load file:// URLs, so embed the fonts.
const data = async (path, type) => `data:${type};base64,${(await readFile(new URL(path, root))).toString("base64")}`;
const heading = await data("assets/fonts/manrope-latin-800-normal.woff2", "font/woff2");
const body = await data("assets/fonts/source-sans-3-latin-600-normal.woff2", "font/woff2");

const lines = (...widths) => widths.map((w) => `<i style="width:${w}%"></i>`).join("");
const html = `<!doctype html><html><head><style>
@font-face { font-family: Manrope; src: url(${heading}); font-weight: 800; }
@font-face { font-family: "Source Sans 3"; src: url(${body}); font-weight: 600; }
* { box-sizing: border-box; }
body { margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative; background: #faf7f2;
  color: #1b2a2f; font-family: "Source Sans 3"; }
.hill { position: absolute; left: 640px; right: 0; bottom: 0; height: 150px; background: #f1ede6;
  border-top: 1px solid #ddd6ca; border-radius: 60% 40% 0 0 / 40% 30% 0 0; }
.text { position: absolute; left: 80px; top: 150px; }
h1 { font: 800 112px/1 Manrope; letter-spacing: -0.03em; margin: 0 0 30px; }
h1 b { color: #b4462f; }
p { margin: 0 0 44px; font-size: 38px; color: #56666b; }
.cta { display: inline-block; background: #1f5f5b; color: #fff; font-size: 26px; padding: 16px 30px; border-radius: 10px; }
.note { position: absolute; width: 270px; padding: 26px 26px 30px; background: #fff; border: 2px solid #ddd6ca;
  border-radius: 16px; box-shadow: 0 14px 30px rgb(0 0 0 / 0.08); }
.note h2 { font: 800 26px/1.1 Manrope; margin: 0 0 18px; }
.note i { display: block; height: 12px; border-radius: 6px; background: #e4ded3; margin-bottom: 12px; }
.tag { display: inline-block; margin-top: 8px; padding: 5px 14px; border: 2px solid #1f5f5b; color: #1f5f5b;
  border-radius: 999px; font-size: 19px; }
.pin { position: absolute; top: -18px; right: 22px; width: 36px; height: 36px; border-radius: 50%; background: #b4462f;
  box-shadow: 0 4px 0 #8f3524; }
.ai { position: absolute; left: 700px; top: 470px; padding: 10px 20px; background: #faf7f2; border: 2px dashed #1f5f5b;
  color: #1f5f5b; border-radius: 999px; font-size: 22px; }
</style></head><body>
<div class="hill"></div>
<div class="text">
  <h1>PNotes<b>.</b></h1>
  <p>Local-first notes, optional AI.</p>
  <span class="cta">Try the live demo</span>
</div>
<div class="note" style="left:690px; top:120px; transform:rotate(-6deg)"><h2>Trip ideas</h2>${lines(92, 70, 84)}<span class="tag">travel</span></div>
<div class="note" style="left:880px; top:70px; transform:rotate(4deg)"><span class="pin"></span><h2>Groceries</h2>${lines(60, 88, 74, 50)}</div>
<div class="note" style="left:850px; top:300px; transform:rotate(-1deg)"><h2>Meeting notes</h2>${lines(95, 80)}<span class="tag">work</span></div>
<span class="ai">✦ Summarise</span>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot({ type: "png" });

// Encode WebP in the browser: full size and a 600px copy for phones.
await page.setContent("<canvas></canvas>");
for (const [width, name] of [[1200, "pnotes.webp"], [600, "pnotes-600.webp"]]) {
  const webp = await page.evaluate(
    async ({ src, width }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.querySelector("canvas");
      canvas.width = width;
      canvas.height = Math.round((width * 630) / 1200);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/webp", 0.82).split(",")[1];
    },
    { src: `data:image/png;base64,${png.toString("base64")}`, width }
  );
  await writeFile(new URL(`assets/brand/${name}`, root), Buffer.from(webp, "base64"));
  console.log(`assets/brand/${name}`);
}
await browser.close();
