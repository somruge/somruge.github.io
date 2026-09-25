// 1. Cache-busting (27): rewrites ?v=... on local assets in the HTML pages to a content hash.
// 2. Exports worker/profile.md from index.html (FR-37), so the assistant and the page can't drift.
// Run before committing page or asset changes: npm run build
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("..", import.meta.url);
const pages = ["index.html", "credits.html"];

for (const page of pages) {
  const url = new URL(page, root);
  let html = await readFile(url, "utf8");
  const refs = [...html.matchAll(/(assets\/[\w./-]+)\?v=[\w-]+/g)];
  for (const asset of new Set(refs.map((m) => m[1]))) {
    const hash = createHash("sha256").update(await readFile(new URL(asset, root))).digest("hex").slice(0, 10);
    html = html.replaceAll(new RegExp(`${asset.replace(/[.]/g, "\\.")}\\?v=[\\w-]+`, "g"), `${asset}?v=${hash}`);
  }
  await writeFile(url, html);
  console.log(`${page}: ${refs.length} asset references hashed`);
}

// Sections the assistant must not use: interactive parts, and nothing else.
const SKIP_SECTIONS = new Set(["play", "ask"]);
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "wbr"]);

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&copy;/g, "©");

// Turns one section's HTML into plain text. Elements marked data-placeholder (owner content not
// yet written, D-018) are dropped with everything inside them, as are SVGs and visually hidden text.
function sectionText(html) {
  let out = "";
  let skipDepth = 0;
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    const [, closing, rawTag, attrs, text] = m;
    if (text !== undefined) {
      if (!skipDepth) out += text.replace(/\s+/g, " ");
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (VOID.has(tag) || attrs.trim().endsWith("/")) continue; // void or self-closing (<path />)
    if (closing) {
      const open = stack.pop();
      if (open?.skip) skipDepth--;
      if (!skipDepth && /^(p|li|dd|dt|h[1-6]|div|summary|span)$/.test(tag)) out += tag === "span" ? " " : "\n";
      continue;
    }
    const skip = /data-placeholder|visually-hidden/.test(attrs) || tag === "svg";
    if (skip) skipDepth++;
    stack.push({ tag, skip });
    if (!skipDepth && tag === "li") out += "- ";
    if (!skipDepth && tag === "dt") out += "\n";
  }
  return decode(out)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && line !== "-") // empty bullets left where placeholders were
    .join("\n");
}

const index = await readFile(new URL("index.html", root), "utf8");
const main = index.slice(index.indexOf("<main"), index.indexOf("</main>"));
const blocks = [];
for (const m of main.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
  const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
  if (!id || SKIP_SECTIONS.has(id)) continue;
  const text = sectionText(m[2]);
  // A section that's only its heading (everything else still placeholder) isn't offered to the
  // assistant, so it can't cite a section with nothing confirmed in it.
  if (text.split("\n").length < 2) continue;
  blocks.push(`## ${id}\n${text}`);
}
const profile = `# Som Ruge — site content\n\n${blocks.join("\n\n")}\n`;
await writeFile(new URL("worker/profile.md", root), profile);
console.log(`worker/profile.md: ${blocks.length} sections, ${profile.length} characters`);
