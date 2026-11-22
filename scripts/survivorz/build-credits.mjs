// SOLACE SURVIVORZ — writes the credits list on the public show page
// (client/public/survivorz.html, between the `credits:start` / `credits:end` markers).
//
//   node scripts/survivorz/build-credits.mjs [--check]
//
// Runs on the workstation: it reads the licence records the asset pipeline keeps in the
// gitignored staging folder, so the page is regenerated there and the result committed.
// Every model under CC BY needs its credit "wherever you share it", and there are far too
// many for a YouTube description, so the page carries them and the description links here.
//
// Sources, merged and de-duplicated by link:
//   - assets/downloads/survivorz/props/CREDITS.txt  (pack-props.mjs: one line per packed prop)
//   - assets/downloads/survivorz/originals/rollo-hazmat/gltf/license.txt  (Rollo's suit)
//   - the CC BY rows of docs/survivorz/ASSETS.md's tables (room pieces sourced outside the props)
// --check prints what it would write and exits 1 if the page is out of date.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const PAGE = path.join(ROOT, "client", "public", "survivorz.html");
const check = process.argv.includes("--check");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Sketchfab links come in two shapes for one model (with and without the slug); key on the id.
const keyOf = (url) => (url.match(/[0-9a-f]{32}/)?.[0] ?? url).toLowerCase();

// The intake records a model with no slug as ".../3d-models/none-<id>"; the bare id is the
// link Sketchfab itself redirects from.
const tidy = (url) => url.replace(/\/3d-models\/none-([0-9a-f]{32})$/, "/3d-models/$1");

const credits = new Map(); // key -> { title, url, author, authorUrl }
const add = (c) => {
  const k = keyOf(c.url);
  if (!credits.has(k)) credits.set(k, c);
};

// 1. the packed props
const propsFile = path.join(STAGE, "props", "CREDITS.txt");
if (!fs.existsSync(propsFile)) throw new Error(`missing ${propsFile} (run pack-props.mjs first)`);
for (const line of fs.readFileSync(propsFile, "utf8").split(/\r?\n/)) {
  if (!/\[CC[- ]BY/.test(line)) continue;
  // two shapes: Sketchfab's own credit line, and the shorter one the intake writes
  const m = line.match(/"(.+?)" \((https?:[^)]+)\) by (.+?) \((https?:[^)]+)\) is licensed under CC[- ]BY/);
  const s = !m && line.match(/"(.+?)" by (.+?) \((https?:[^)]+)\) — CC[- ]BY/);
  if (m) add({ title: m[1], url: tidy(m[2]), author: m[3], authorUrl: m[4] });
  else if (s) add({ title: s[1], url: tidy(s[3]), author: s[2], authorUrl: "" });
  else throw new Error(`can't read credit line: ${line}`);
}

// 2. Rollo's suit
const hazmat = fs.readFileSync(path.join(STAGE, "originals", "rollo-hazmat", "gltf", "license.txt"), "utf8");
{
  const title = hazmat.match(/title:\s*(.+)/)?.[1].trim();
  const url = hazmat.match(/source:\s*(\S+)/)?.[1];
  const am = hazmat.match(/author:\s*(.+?) \((\S+)\)/);
  if (!title || !url || !am) throw new Error("can't read the hazmat licence");
  add({ title, url, author: am[1], authorUrl: am[2] });
}

// 3. CC BY rows in ASSETS.md: | fills | [Title](url) | Author | CC BY | ...
for (const line of fs.readFileSync(path.join(ROOT, "docs", "survivorz", "ASSETS.md"), "utf8").split(/\r?\n/)) {
  const cells = line.split("|").map((s) => s.trim());
  if (cells.length < 5 || !/^CC[- ]BY/.test(cells[4])) continue;
  const m = cells[2].match(/^\[(.+)\]\((https?:[^)]+)\)$/);
  if (!m) continue;
  add({ title: m[1], url: m[2], author: cells[3], authorUrl: "" });
}

const list = [...credits.values()].sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
const items = list
  .map((c) => {
    const who = c.authorUrl ? `<a href="${esc(c.authorUrl)}" rel="noopener">${esc(c.author)}</a>` : esc(c.author);
    return `      <li><a href="${esc(c.url)}" rel="noopener">${esc(c.title)}</a> by ${who}</li>`;
  })
  .join("\n");
const block =
  `<!-- credits:start (written by scripts/survivorz/build-credits.mjs — don't edit by hand) -->\n` +
  `    <p class="note">${list.length} models, each licensed under ` +
  `<a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>. Some were cut, resized or recoloured to fit the facility.</p>\n` +
  `    <ul class="credits">\n${items}\n    </ul>\n    <!-- credits:end -->`;

const page = fs.readFileSync(PAGE, "utf8");
const re = /<!-- credits:start[\s\S]*?<!-- credits:end -->/;
if (!re.test(page)) throw new Error("the page has no credits markers");
const next = page.replace(re, block);
if (check) {
  console.log(`${list.length} credits; page ${next === page ? "up to date" : "OUT OF DATE"}`);
  process.exit(next === page ? 0 : 1);
}
fs.writeFileSync(PAGE, next);
console.log(`wrote ${list.length} credits into ${path.relative(ROOT, PAGE)}`);
