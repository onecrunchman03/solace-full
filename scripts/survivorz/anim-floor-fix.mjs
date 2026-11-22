// SURVIVORZ: keeps every clip's skin out of the floor. The source rigs (Mixamo's X Bot, the UE
// mannequins) are built differently from the scanned bodies, so the same hip drop that lays an
// X Bot on the floor puts a scanned body 10-25 cm into it (falls, deaths, kneels, crawls). For
// each clip, at every key of its hips track, the skin's lowest point is measured; wherever it
// is below the floor (past the ALLOW a shoe sole sits into it), the hips are raised by exactly
// that much — smoothed so the lift never pops. A body that should end up lying on the floor
// ends up lying ON it. Swimming is left alone (it is meant to be under the surface).
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/anim-floor-fix.mjs <body>      then repack: node scripts/survivorz/pack.mjs <body>
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const body = process.argv[2];
const ALLOW = 0.012;            // a shoe sole sits this far into the floor on a standing idle
const SKIP = /swim/;
const npx = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");

// a lift that holds its peak a moment either side and eases in and out, so it never pops
function smooth(v, times) {
  const n = v.length, hold = 0.15, ease = 0.1, out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < n; j++) if (Math.abs(times[j] - times[i]) <= hold) m = Math.max(m, v[j]); out[i] = m; }
  const res = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let j = 0; j < n; j++) if (Math.abs(times[j] - times[i]) <= ease) { s += out[j]; w++; } res[i] = Math.max(v[i], s / w); }
  return res;
}

const job = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${body}.json`), "utf8"));
const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-render.html?body=/assets/downloads/survivorz/game/${body}.glb&size=64`);
await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
const clips = await page.evaluate(() => window.r.clips());
const unit = (await page.evaluate((n) => window.r.lowest(n), clips[0].name)).unit;
let fixed = 0;
for (const c of clips) {
  if (SKIP.test(c.name) || (process.env.ONLY && !new RegExp(process.env.ONLY).test(c.name))) continue;
  const f = path.join(STAGE, "out", job.out, `${c.name}.json`);
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  // a re-run measures the clip as it is now, so a second pass only adds what is still missing
  const tr = j.tracks.find((t) => t.name.endsWith(".position"));
  if (!tr) continue;
  const below = await page.evaluate(([n, t, a]) => window.r.below(n, t, a), [c.name, tr.times, ALLOW]);
  const worst = Math.max(...below);
  if (worst < 0.005) continue;
  const lift = smooth(below, tr.times);
  for (let i = 0; i < tr.times.length; i++) tr.values[i * 3 + 1] += lift[i] / unit;
  j.floorFixed = +((j.floorFixed || 0) + worst).toFixed(3);
  // (DRY=1 lists what a pass would lift and writes nothing; ONLY=<regex> keeps it to the clips it matches)
  if (!process.env.DRY) fs.writeFileSync(f, JSON.stringify(j));
  fixed++;
  console.log(`  ${c.name.padEnd(48)} lifted up to ${worst.toFixed(3)} m`);
}
console.log(`${body}: ${fixed} clips kept out of the floor`);
await browser.close();
