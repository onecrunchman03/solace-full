// A throwaway static server rooted at the REPO, for the animation bench.
//
// Rooted at the repo (not client/) on purpose: that way the bench page can
// import three straight out of client/node_modules AND load models from
// client/public/assets with plain absolute paths, so there is no build step and
// nothing to keep in sync.
//
// Short-lived by design — start it, look, kill it. Never part of the app.
//
//   node scripts/serve-root.mjs [port]
//   node scripts/serve-root.mjs 8791 --thumbs
//
// --thumbs: the prop kit's THUMBNAIL SINK (Oct 2026). The thumbnail page
// (scripts/props/thumbs.html) renders a built prop to its canvas; a browser on
// it POSTs the PNG to /__thumb/<file>.png and it lands in
// assets/_propcache/kitthumbs/ — same origin, so no Playwright and no CORS.
// Then `node scripts/props/build.mjs --thumbs` makes the WebPs.

import { createServer } from "node:http";
import { createReadStream, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv.find((a, i) => i > 1 && /^\d+$/.test(a)) ?? 8791);
const THUMBS = process.argv.includes("--thumbs");
const THUMB_DIR = path.join(ROOT, "assets", "_propcache", "kitthumbs");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".fbx": "application/octet-stream",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (THUMBS && req.method === "POST" && url.pathname.startsWith("/__thumb/")) {
    const name = decodeURIComponent(url.pathname.slice("/__thumb/".length));
    if (!/^[a-z0-9-]+.png$/.test(name)) {
      res.writeHead(400).end("bad name");
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      mkdirSync(THUMB_DIR, { recursive: true });
      writeFileSync(path.join(THUMB_DIR, name), Buffer.concat(chunks));
      res.writeHead(200).end("ok");
    });
    return;
  }
  // Path traversal: resolve, then require the result to stay inside ROOT.
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("no");
    return;
  }
  let st;
  try {
    st = statSync(file);
  } catch {
    res.writeHead(404).end("not found: " + url.pathname);
    return;
  }
  if (st.isDirectory()) {
    res.writeHead(403).end("directory");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": st.size,
    "cache-control": "no-store",
    // which checkout this is serving: the creator's bake refuses pages from another one (bake.mjs)
    "x-serve-root": encodeURIComponent(ROOT),
  });
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`bench: http://127.0.0.1:${PORT}/scripts/animview.html`);
});
