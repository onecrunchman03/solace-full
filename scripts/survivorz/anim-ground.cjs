// SURVIVORZ: does every clip on a body touch the floor? For each clip packed into
// assets/downloads/survivorz/game/<body>.glb, the lowest any bone gets over the whole clip.
// A body that never comes near the floor is floating — Mixamo's lying clips are authored on an
// invisible bed. Writes assets/downloads/survivorz/anim/<body>/ground.json.
//   node scripts/survivorz/anim-ground.cjs <body>
const fs = require("fs"), path = require("path"), os = require("os");
const npx = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const body = process.argv[2];
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-render.html?body=/assets/downloads/survivorz/game/${body}.glb&size=64`);
  await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
  const clips = await page.evaluate(() => window.r.clips());
  const out = {};
  for (const c of clips) out[c.name] = await page.evaluate((n) => window.r.lowest(n), c.name);
  const dir = path.join(__dirname, "..", "..", "assets", "downloads", "survivorz", "anim", body);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ground.json"), JSON.stringify(out, null, 1));
  const floating = Object.entries(out).filter(([, g]) => g.low > 0.15).sort((a, b) => b[1].low - a[1].low);
  console.log(`${body}: ${clips.length} clips · ${floating.length} never come within 15 cm of the floor:`);
  for (const [n, g] of floating) console.log(`  ${n.padEnd(48)} lowest ${g.low} m`);
  await browser.close();
})();
