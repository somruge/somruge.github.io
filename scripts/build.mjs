// Cache-busting (27): rewrites ?v=... on local assets in the HTML pages to a content hash,
// replacing the hand-bumped version numbers. Run before committing asset changes.
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
