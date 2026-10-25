// Renders a certificate (the first page of a PDF, or an image) to assets/certs/<name>.webp (up to 1600 wide)
// and <name>-600.webp, for the Certifications section. Run once per certificate:
// node scripts/cert-image.mjs "/mnt/c/SomDoc/PMI Certification.pdf" pmp
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const [file, name] = process.argv.slice(2);
if (!file || !/^[a-z0-9-]+$/.test(name ?? "")) {
  console.error('Usage: node scripts/cert-image.mjs <certificate.pdf or image> <name, e.g. "pmp">');
  process.exit(1);
}

async function renderPdf(pdf) {
  // Chromium's PDF viewer draws the page; the toolbar and side panel are turned off and the page fitted to the window.
  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 2 });
  await page.goto(`${pathToFileURL(pdf).href}#toolbar=0&navpanes=0&view=Fit`);
  await page.waitForTimeout(3000);
  const shot = await page.screenshot();
  await browser.close();
  // Trim the viewer's grey surround down to the certificate itself.
  return sharp(shot).trim({ threshold: 20 }).toBuffer();
}

// Images are trimmed too, in case the certificate sits on a plain margin.
const cert = /\.pdf$/i.test(file) ? await renderPdf(file) : await sharp(await readFile(file)).trim({ threshold: 20 }).toBuffer();
const dir = new URL("../assets/certs/", import.meta.url);
await mkdir(dir, { recursive: true });
for (const [suffix, width] of [["", 1600], ["-600", 600]]) {
  const info = await sharp(cert).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(new URL(`${name}${suffix}.webp`, dir).pathname);
  console.log(`assets/certs/${name}${suffix}.webp: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
}
