// SURVIVORZ EFFECTS BENCH — records each effect as a short video with its cost,
// for Josh's review page (docs/survivorz/EFFECTS.md §4).
//
//   node scripts/serve-root.mjs 8791          (in another shell, if it isn't up)
//   node scripts/survivorz/fx-bench.mjs [scenario...] [--gpu]
//   -> assets/downloads/survivorz/fx/review/<scenario>.mp4 + review.json
//
// 1. BUNDLES THE SHIPPED ENGINE (client/src/survivorz/fx) with esbuild into
//    fx/bench/fx.js — three stays external (the page's import map), so the
//    bench runs the exact code the show runs, never a copy.
// 2. Renders every scenario on a FIXED clock (fx.update(1/FPS) per frame) and
//    encodes the frames with ffmpeg.
// 3. Steps the scenario again to its busiest frame and times it on the GPU,
//    with and without the effects drawn: the effects' own milliseconds, their
//    draw calls, live particles and memory, next to EFFECTS.md §2's budget.
//    --gpu runs the videos on the real GPU too (faster); the default records on
//    whatever Chromium gets and only the cost pass insists on hardware.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const FX = path.join(ROOT, "assets", "downloads", "survivorz", "fx");
const OUT = path.join(FX, "review");
const FPS = 30, W = 960, H = 540;
const BASE = process.env.FX_BENCH_BASE || "http://127.0.0.1:8791";
const BUDGET = { draws: 60, ms: 1.5, mb: 150, particles: 4000 };

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

async function bundle() {
  const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));
  fs.mkdirSync(path.join(FX, "bench"), { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(ROOT, "client", "src", "survivorz", "fx", "index.ts")],
    outfile: path.join(FX, "bench", "fx.js"),
    bundle: true, format: "esm", platform: "browser", target: "es2022", sourcemap: "inline",
    external: ["three", "three/*"], logLevel: "warning",
  });
}

const GPU_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl-draft-extensions"];

async function main() {
  const args = process.argv.slice(2);
  const wantGpu = args.includes("--gpu");
  // --1080: time the cost pass at the stream's own resolution (the videos stay 960x540);
  // --sweep: time every half second of each scene and keep the worst, not just the busiest frame
  const at1080 = args.includes("--1080"), sweep = args.includes("--sweep");
  const only = args.filter((a) => !a.startsWith("--"));
  await bundle();
  const { chromium } = findPlaywright();
  const open = async (gpu, w = W, h = H) => {
    const browser = await chromium.launch({ executablePath: findChrome(), headless: !gpu, args: gpu ? GPU_ARGS : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on("pageerror", (e) => console.error("page:", e.message));
    await page.goto(`${BASE}/scripts/survivorz/fx-bench.html?w=${w}&h=${h}`);
    await page.waitForFunction(() => window.r?.ready || window.r?.error, null, { timeout: 180000 });
    const err = await page.evaluate(() => window.r.error);
    if (err) throw new Error(err);
    return { browser, page };
  };
  fs.mkdirSync(OUT, { recursive: true });
  const reviewFile = path.join(OUT, "review.json");
  const review = fs.existsSync(reviewFile) ? JSON.parse(fs.readFileSync(reviewFile, "utf8")) : {};

  const rec = await open(wantGpu);
  const scen = await rec.page.evaluate(() => window.r.scenarios());
  const posters = await rec.page.evaluate(() => window.r.posters?.() ?? {});
  const names = Object.keys(scen).filter((n) => !only.length || only.includes(n));
  const peaks = {};
  for (const name of names) {
    const t0 = Date.now();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fxbench-"));
    await rec.page.evaluate((n) => window.r.use(n), name);
    const frames = Math.round(scen[name] * FPS);
    let peak = { frame: 0, particles: -1 }, maxDraws = 0, maxDecals = 0;
    for (let f = 0; f < frames; f++) {
      const st = await rec.page.evaluate((dt) => window.r.step(dt), 1 / FPS);
      if (st.particles > peak.particles) peak = { frame: f, particles: st.particles };
      maxDraws = Math.max(maxDraws, st.draws);
      maxDecals = Math.max(maxDecals, st.decals);
      const url = await rec.page.evaluate(() => window.r.frame());
      fs.writeFileSync(path.join(tmp, `f_${String(f).padStart(4, "0")}.png`), Buffer.from(url.split(",")[1], "base64"));
    }
    const mp4 = path.join(OUT, `${name}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", path.join(tmp, "f_%04d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", mp4]);
    // a poster frame at the busiest moment, for the review page
    const posterFrame = posters[name] != null ? Math.min(frames - 1, Math.round(posters[name] * FPS)) : peak.frame;
    fs.copyFileSync(path.join(tmp, `f_${String(posterFrame).padStart(4, "0")}.png`), path.join(OUT, `${name}.png`));
    fs.rmSync(tmp, { recursive: true, force: true });
    peaks[name] = { ...peak, maxDraws, maxDecals };
    console.log(`${name}: ${frames} frames, peak ${peak.particles} particles at ${(peak.frame / FPS).toFixed(1)}s, ${maxDraws} draws, ${maxDecals} decals (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  await rec.browser.close();

  // THE COST PASS, on the real GPU: the busiest frame of each scenario, timed with and
  // without the effects drawn
  const gpu = at1080 ? await open(true, 1920, 1080) : await open(true);
  for (const name of names) {
    await gpu.page.evaluate((n) => window.r.use(n), name);
    let c;
    if (sweep) {
      // every half second to the end; the worst moment for the effects' own time
      const frames = Math.round(scen[name] * FPS);
      let worstAt = 0;
      for (let f = 0; f < frames; f++) {
        await gpu.page.evaluate((dt) => window.r.step(dt), 1 / FPS);
        if (f % 15 !== 14) continue;
        const k = await gpu.page.evaluate(() => window.r.cost(12));
        if (!c || (k.fxMs ?? 0) > (c.fxMs ?? 0)) { c = k; worstAt = (f + 1) / FPS; }
      }
      console.log(`${name}: the worst moment for the effects was at ${worstAt.toFixed(1)} s`);
    } else {
      for (let f = 0; f <= peaks[name].frame; f++) await gpu.page.evaluate((dt) => window.r.step(dt), 1 / FPS);
      c = await gpu.page.evaluate(() => window.r.cost(30));
    }
    const fxMs = c.fxMs == null ? null : Math.max(0, Math.round(c.fxMs * 1000) / 1000);
    const pass = { draws: peaks[name].maxDraws <= BUDGET.draws, ms: fxMs == null || fxMs <= BUDGET.ms, mb: c.stats.gpuMB <= BUDGET.mb, particles: peaks[name].particles <= BUDGET.particles };
    review[name] = { ...(review[name] ?? {}), video: `${name}.mp4`, poster: `${name}.png`, seconds: scen[name], peak: peaks[name], fxMs, frameMs: c.gpuMsWith, costAt: at1080 ? "1920x1080" : `${W}x${H}`, ...(sweep ? { swept: true } : {}), gpuMB: c.stats.gpuMB, gpu: c.gpu, pass, at: new Date().toISOString() };
    console.log(`${name}: effects ${fxMs ?? "?"} ms of a ${c.gpuMsWith?.toFixed?.(2) ?? "?"} ms frame, ${peaks[name].maxDraws} draws, ${c.stats.gpuMB} MB — ${Object.values(pass).every(Boolean) ? "inside budget" : "OVER: " + JSON.stringify(pass)} (${c.gpu})`);
  }
  await gpu.browser.close();
  fs.writeFileSync(reviewFile, JSON.stringify(review, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
