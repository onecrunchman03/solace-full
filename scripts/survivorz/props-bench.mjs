// SURVIVORZ PROPS BENCH: renders every packed prop beside a 1.8 m figure and writes
// contact sheets, so a prop's scale, look and textures are checked by eye before use.
//
//   node scripts/serve-root.mjs 8793        (in another shell; not 8791, the effects bench's)
//   node scripts/survivorz/props-bench.mjs [id ...] [--grips]
//   --grips: close-ups with each held prop's grip drawn (props.json grip), into review/grips/
//   → assets/downloads/survivorz/props/review/<id>.png + sheet-<n>.jpg (16 to a sheet, labelled)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROPS = path.join(ROOT, "assets", "downloads", "survivorz", "props");
const GRIPS = process.argv.includes("--grips");
const OUT = path.join(PROPS, "review", ...(GRIPS ? ["grips"] : []));
const BASE = process.env.PROPS_BENCH_BASE || "http://127.0.0.1:8793";
const W = 640, H = 480;

const findPlaywright = () => {
  try { return require("playwright-core"); } catch {}
  const npx = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".npm"), "npm-cache", "_npx");
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const p = path.join(npx, d, "node_modules", "playwright-core");
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error("playwright-core not found");
};
const findChrome = () => {
  const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const exe = path.join(base, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
};

const index = JSON.parse(fs.readFileSync(path.join(PROPS, "props.json"), "utf8"));
const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ids = named.length ? named : Object.keys(index).filter((id) => !GRIPS || index[id].grip).sort();
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = findPlaywright();
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const results = {};
for (const id of ids) {
  await page.goto(`${BASE}/scripts/survivorz/props-bench.html?id=${encodeURIComponent(id)}&w=${W}&h=${H}${GRIPS ? "&grip=1&close=1" : ""}`);
  await page.waitForFunction(() => window.r?.ready || window.r?.error, null, { timeout: 180000 });
  const r = await page.evaluate(() => window.r);
  if (r.error) { console.log(`${id.padEnd(22)} FAILED ${r.error.split("\n")[0]}`); results[id] = { error: r.error }; continue; }
  await page.locator("canvas").screenshot({ path: path.join(OUT, `${id}.png`) });
  results[id] = r.info;
  console.log(`${id.padEnd(22)} ${r.info.size.join(" x ")} m${r.info.small ? " (close-up)" : ""}`);
}
await browser.close();
fs.writeFileSync(path.join(OUT, "bench.json"), JSON.stringify(results, null, 1));

// contact sheets, 4 x 4, each tile labelled with its id
const done = ids.filter((id) => !results[id].error);
for (let s = 0; s * 16 < done.length; s++) {
  const tiles = done.slice(s * 16, s * 16 + 16);
  const inputs = tiles.flatMap((id) => ["-i", path.join(OUT, `${id}.png`)]);
  const lab = tiles.map((id, i) => `[${i}]scale=480:360,drawtext=text='${id}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6[t${i}]`).join(";");
  const pad = Array.from({ length: 16 - tiles.length }, (_, i) => `color=c=0x2a2c30:s=480x360:d=1[p${i}]`).join(";");
  const all = [...tiles.map((_, i) => `[t${i}]`), ...Array.from({ length: 16 - tiles.length }, (_, i) => `[p${i}]`)].join("");
  const layout = Array.from({ length: 16 }, (_, i) => `${(i % 4) * 480}_${Math.floor(i / 4) * 360}`).join("|");
  const fc = [lab, pad].filter(Boolean).join(";") + `;${all}xstack=inputs=16:layout=${layout}`;
  const out = path.join(OUT, `sheet-${s + 1}.jpg`);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex", fc, "-frames:v", "1", "-q:v", "3", out]);
  console.log("wrote", path.relative(ROOT, out));
}
