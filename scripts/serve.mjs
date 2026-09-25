// Minimal static server for local development and tests (no dependencies).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 8080);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

// In development, /api/* goes to the local assistant Worker (npm run worker:dev), so the page's
// security policy needs no localhost exception. In production the page calls the Worker directly.
const WORKER = process.env.WORKER_URL ?? "http://localhost:8787";

async function proxy(req, res, path) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const upstream = await fetch(WORKER + path.slice("/api".length), {
      method: req.method,
      headers: { "content-type": req.headers["content-type"] ?? "application/json", origin: `http://localhost:${port}` },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
    });
    res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.writeHead(502, { "content-type": "application/json" }).end('{"error":"worker_unreachable"}');
  }
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.startsWith("/api/")) return proxy(req, res, path);
  let file = normalize(join(root, path));
  if (!file.startsWith(root) || file.includes("node_modules")) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
