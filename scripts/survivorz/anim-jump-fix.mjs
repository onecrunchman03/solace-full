// SURVIVORZ: puts the JUMP into the rifle pack's jump clips (Josh, Oct 21 2026, on the review: "he
// is not jumping from ground"). The pack's jump-up / jump-loop / jump-down are made for a game that
// lifts the character itself: the hips only ever come back to standing height and the legs tuck, so
// on its own the body never leaves the floor. Here the arc goes into the hips, in metres off the
// ground, as a real jump moves them: a take-off from the end of the push (v0 for a 0.35 m peak),
// the apex held through the air loop with a slight float, and a free fall into the landing's
// crouch. The game plays these three as they are and must NOT add its own jump arc on top.
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/anim-jump-fix.mjs <body>      then repack: node scripts/survivorz/pack.mjs <body>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const body = process.argv[2];
if (!body) throw new Error("usage: anim-jump-fix.mjs <body>");
const G = 9.81, PEAK = 0.35, V0 = Math.sqrt(2 * G * PEAK), APEX = V0 / G;
// the lift (metres) at time t of each clip. t0 / land: read off the clips' own skin heights (the push
// ends and the feet leave at ~0.33 s; the landing's feet touch at ~0.29 s)
const ARC = {
  "mx-pro-rifle-pack--jump-up": (t) => { const d = t - 0.33; return d <= 0 ? 0 : V0 * d - 0.5 * G * d * d; },
  "mx-pro-rifle-pack--jump-loop": (t, dur) => PEAK - 0.01 + 0.01 * Math.cos((2 * Math.PI * t) / dur),
  "mx-pro-rifle-pack--jump-down": (t) => { const fall = 0.29 - APEX; if (t <= fall) return PEAK; if (t >= 0.29) return 0; const d = t - fall; return PEAK - 0.5 * G * d * d; },
};
const npx = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const job = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${body}.json`), "utf8"));
const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-render.html?body=/assets/downloads/survivorz/game/${body}.glb&size=64`);
await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
// the hips track is in the hips' parent's units: what one of them is in metres
const unit = (await page.evaluate((n) => window.r.lowest(n), "mx-pro-rifle-pack--jump-up")).unit;
await browser.close();
for (const [clip, arc] of Object.entries(ARC)) {
  const f = path.join(STAGE, "out", job.out, `${clip}.json`);
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (j.jumpArc) { console.log(`  ${clip}: already has its arc`); continue; }
  const tr = j.tracks.find((t) => t.name.endsWith(".position"));
  for (let i = 0; i < tr.times.length; i++) tr.values[i * 3 + 1] += arc(tr.times[i], j.duration) / unit;
  j.jumpArc = PEAK;
  fs.writeFileSync(f, JSON.stringify(j));
  console.log(`  ${clip}: arc in (peak ${PEAK} m)`);
}
