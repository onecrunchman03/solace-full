// SURVIVORZ: bakes a list of clips onto a body with scripts/survivorz/retarget.html
// and writes each as AnimationClip JSON plus a contact sheet (source skeleton
// left, the body right, three moments) — every conversion is LOOKED AT.
//
// Everything lives in the gitignored assets/downloads/survivorz/ until Josh says
// build (the show's assets are licensed no-redistribution).
//
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/retarget-batch.cjs <jobs.json> [onlySubstr]
//
// jobs.json: { "target": "/assets/downloads/survivorz/targets/eric/x.gltf",
//              "tfam": "rp", "out": "rp-a", "jobs": [ {id, src, clip?, from?, until?, travel?} ] }
const fs = require("fs"), path = require("path"), os = require("os");
const findPlaywright = () => {
  try { return require("playwright-core"); } catch {}
  const npx = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".npm"), "npm-cache", "_npx");
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const p = path.join(npx, d, "node_modules", "playwright-core");
    if (fs.existsSync(p)) return require(p);
  }
};
const findChrome = () => {
  const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const exe = path.join(base, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
};
const ROOT = path.join(__dirname, "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const ONLY = (process.argv[3] ?? "").toLowerCase();
const OUT = path.join(STAGE, "out", spec.out);
const SHEETS = path.join(STAGE, "sheets", spec.out);
(async () => {
  const { chromium } = findPlaywright();
  const browser = await chromium.launch({ executablePath: findChrome(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 520, height: 460 } });
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHEETS, { recursive: true });
  const report = []; const t0 = Date.now();
  // a job marked `built` is made by anim-build.cjs, not converted from a source clip
  for (const j of spec.jobs.filter((j) => !j.built && j.id.toLowerCase().includes(ONLY))) {
    const q = new URLSearchParams({ src: j.src, target: spec.target, tfam: spec.tfam, name: j.id });
    if (j.clip) q.set("clip", j.clip);
    if (j.from != null) q.set("from", j.from);
    if (j.until != null) q.set("until", j.until);
    if (j.travel) q.set("travel", "1");
    if (j.rest) q.set("rest", j.rest);
    await page.goto(`http://127.0.0.1:8791/scripts/survivorz/retarget.html?${q}`);
    await page.waitForFunction(() => window.bench?.ready, null, { timeout: 120000 });
    const err = await page.evaluate(() => window.bench.error);
    if (err) { console.log("ERROR", j.id, err); report.push({ id: j.id, error: err }); continue; }
    const info = await page.evaluate(() => window.bench.info());
    const json = await page.evaluate(() => window.bench.bake(30));
    fs.writeFileSync(path.join(OUT, `${j.id}.json`), JSON.stringify(json));
    const shots = [];
    for (const [frac, yaw] of spec.sheets === false ? [] : [[0.1, 0], [0.5, 0], [0.9, 0], [0.5, 90]]) {
      await page.evaluate(([t, y]) => { window.bench.view(y); window.bench.show(t); }, [info.kept * frac, yaw]);
      const p = path.join(SHEETS, `${j.id}-${Math.round(frac * 100)}${yaw ? "s" : ""}.png`);
      await page.screenshot({ path: p }); shots.push(p);
    }
    const kb = +(fs.statSync(path.join(OUT, `${j.id}.json`)).size / 1024).toFixed(0);
    report.push({ id: j.id, ...info, kb, shots });
    console.log(j.id, JSON.stringify(info), `${kb}KB`);
  }
  fs.writeFileSync(path.join(SHEETS, ONLY ? `report-${ONLY}.json` : "report.json"), JSON.stringify(report, null, 1));
  const bad = report.filter((r) => r.error || r.err > 10);
  console.log(`${report.length} clips in ${((Date.now() - t0) / 1000).toFixed(0)}s; ${bad.length} to look at: ${bad.map((r) => r.id + (r.error ? " ERROR" : ` ${r.err}deg@${r.errAt}`)).join(", ")}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
