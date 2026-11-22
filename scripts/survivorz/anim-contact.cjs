// SURVIVORZ: does every clip on a body meet the floor properly? For each clip packed into
// assets/downloads/survivorz/game/<body>.glb, the SKIN's lowest point at 25 moments: a clip
// that goes below the floor is SINKING, one that never comes down to it is FLOATING (a jump is
// meant to). Writes anim/<body>/contact.json and prints the offenders.
//   node scripts/survivorz/anim-contact.cjs <body> [--sink 0.03] [--float 0.1]
const fs = require("fs"), path = require("path");
const npx = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const body = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SINK = arg("--sink", 0.03), FLOAT = arg("--float", 0.1);
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-render.html?body=/assets/downloads/survivorz/game/${body}.glb&size=64`);
  await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
  const clips = await page.evaluate(() => window.r.clips());
  const out = {};
  for (const c of clips) out[c.name] = await page.evaluate((n) => window.r.contact(n), c.name);
  const dir = path.join(__dirname, "..", "..", "assets", "downloads", "survivorz", "anim", body);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "contact.json"), JSON.stringify(out, null, 1));
  const sink = Object.entries(out).filter(([, g]) => g.min < -SINK).sort((a, b) => a[1].min - b[1].min);
  const flo = Object.entries(out).filter(([, g]) => g.min > FLOAT).sort((a, b) => b[1].min - a[1].min);
  console.log(`${body}: ${clips.length} clips · ${sink.length} sink below the floor · ${flo.length} never reach it`);
  for (const [n, g] of sink) console.log(`  SINKS  ${n.padEnd(48)} down to ${g.min} m`);
  for (const [n, g] of flo) console.log(`  FLOATS ${n.padEnd(48)} lowest ${g.min} m`);
  await browser.close();
})();
