// SURVIVORZ: THE ANIMATION LAW's measure over every clip on a body (SURVIVORZ.md §10: "arms or
// legs are not allowed to clip into body"). For each clip packed into game/<body>.glb, 12
// moments: how deep any arm, hand or leg vertex goes inside the body's own torso (measured round
// the spine, so a bent, lying or crawling body is read properly). Writes anim/<body>/clip.json and
// prints the clips past the line, worst first.
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/anim-clip.cjs <body> [onlySubstr] [--line 0.03]
const fs = require("fs"), path = require("path"), os = require("os");
const npx = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".npm"), "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const STAGE = path.join(__dirname, "..", "..", "assets", "downloads", "survivorz");
// THE SUIT ALLOWANCE (Josh's call, Oct 24 2026): Rollo's hazmat suit is padding over a person, and padding
// squashes where an arm crosses it — so on his body the line is 3 cm further in. Past that is still a clip.
// The same allowance applies to any pair check with Rollo in it (docs/survivorz/anim-pairs.mjs SUIT_ALLOW)
const SUIT_ALLOW = { rollo: 0.03 };
const args = process.argv.slice(2), li = args.indexOf("--line"), LINE0 = li >= 0 ? +args.splice(li, 2)[1] : 0.03;
const [body, only = ""] = args;
const LINE = LINE0 + (li >= 0 ? 0 : SUIT_ALLOW[body] ?? 0);
if (!body) throw new Error("usage: anim-clip.cjs <body> [onlySubstr] [--line metres]");
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-render.html?body=/assets/downloads/survivorz/game/${body}.glb&size=64`);
  await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.r.error); if (err) throw new Error(err);
  const clips = (await page.evaluate(() => window.r.clips())).filter((c) => c.name.includes(only) && !/^fz-|swim/.test(c.name));
  const out = {};
  for (const c of clips) out[c.name] = await page.evaluate((n) => window.r.selfClip(n), c.name);
  fs.mkdirSync(path.join(STAGE, "anim", body), { recursive: true });
  const file = path.join(STAGE, "anim", body, "clip.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  fs.writeFileSync(file, JSON.stringify({ ...prev, ...out }, null, 1));
  // past the line: a moment with more than 15 limb vertices over 2 cm inside the body, and the
  // deepest over LINE
  const bad = Object.entries(out).filter(([, v]) => v.frames > 0 && v.depth > LINE).sort((a, b) => b[1].most - a[1].most);
  for (const [n, v] of bad) console.log(`${String(v.most).padStart(4)} verts, ${(v.depth * 100).toFixed(1).padStart(5)} cm deep  ${n}  (${v.bone ?? v.limb}, ${v.frames}/${v.of} moments, worst at ${v.t}s)`);
  console.log(`${body}: ${clips.length} clips, ${bad.length} past ${LINE * 100} cm`);
  await browser.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
