// SURVIVORZ: THE HANDS check (scripts/survivorz/anim-hands.js) over every clip packed into a body:
// fingers through each other, through the palm, into what the hand holds or floating off it, a
// finger out of step with its neighbours, a fingertip bent alone. Lists each clip's findings
// (a finding must hold HANDS_MIN frames to count — one frame is a measure's noise, not a pose),
// and for a built clip which of them its base mocap doesn't already have.
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/anim-hands.cjs <body> [substr]   -> anim/<body>/hands.json (merged)
// The COUPLE baseline (how differently neighbouring fingers curl in this body's own mocap) is
// cached in anim/<body>/hands-base.json; --rebase measures it again.
const fs = require("fs"), path = require("path");
const npx = path.join(process.env.LOCALAPPDATA, "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.readdirSync(npx)) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const ROOT = path.join(__dirname, "..", "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [body, only] = args;
const BUILT = /^(bd|gr|gs|gp|hd)-/, SKIP = /^fz-/;
const MIN = 2;            // frames a finding must hold
const COUPLE_SLACK = 25;  // degrees past the mocap's own 99.5th percentile
const PAIRS = [["middle", "ring"], ["ring", "pinky"], ["index", "middle"]];
const ANIM = path.join(ROOT, "assets", "downloads", "survivorz", "anim", body);
const index = fs.existsSync(path.join(ANIM, "index.json")) ? JSON.parse(fs.readFileSync(path.join(ANIM, "index.json"), "utf8")) : {};
const pct = (a, p) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.round((v.length - 1) * p))] : null; };
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  page.on("pageerror", (e) => console.log("page:", e.message));
  await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-render.html?body=/assets/downloads/survivorz/game/${body}.glb&size=64`);
  await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
  const e = await page.evaluate(() => window.r.error); if (e) throw new Error(e);
  const bases = await page.evaluate(async () => { const M = await import("./anim-recipes.js"); return Object.fromEntries(Object.entries(M.RECIPES).map(([k, v]) => [k, v.base])); });
  const baseOf = (n) => /^hd-/.test(n) ? n.replace(/^hd-[a-z]+-/, "") : /^(gr|gs|gp)-/.test(n) ? n.replace(/^(gr|gs|gp)-/, "") : /^bd-/.test(n) ? (bases[n.slice(3)] ?? bases[n.slice(3).replace(/-(eric|carla|claudia|manuel|nathan|sophia|rollo)$/, "")] ?? null) : null;
  const all = (await page.evaluate(() => window.r.clips())).map((c) => c.name).filter((n) => !SKIP.test(n));
  const measure = async (n) => { await page.evaluate((n) => window.r.use(n), n); return page.evaluate(([n, l]) => window.r.hands(n, 30, l), [n, !!index[n]?.loop]); };
  // ---- the COUPLE baseline: how differently neighbours curl in this body's own mocap
  const BF = path.join(ANIM, "hands-base.json");
  let B;
  if (fs.existsSync(BF) && !process.argv.includes("--rebase")) B = JSON.parse(fs.readFileSync(BF, "utf8"));
  else {
    const diffs = {};
    for (const n of all.filter((n) => !BUILT.test(n))) {
      const m = await measure(n);
      for (const f of m.frames) for (const s of ["l", "r"]) { const c = f[s]?.c; if (!c) continue; for (const [a, b] of PAIRS) if (c[a] != null && c[b] != null) (diffs[`${a}-${b}_${s}`] ??= []).push(Math.abs(c[a] - c[b])); }
    }
    B = { couple: Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, pct(v, 0.995)])) };
    fs.writeFileSync(BF, JSON.stringify(B, null, 1));
    console.log(`${body}: couple baseline`, JSON.stringify(B.couple));
  }
  // ---- every clip: its findings as runs (worst value, first time, frames held)
  const out = {}, list = only ? all.filter((n) => n.includes(only)) : all;
  for (const n of list) {
    const m = await measure(n), runs = {};
    m.frames.forEach((f) => {
      for (const s of ["l", "r"]) {
        const h = f[s]; if (!h) continue;
        const keys = h.f.map(([k, v]) => [`${k}_${s}`, v]);
        for (const [a, b] of PAIRS) { const k = `${a}-${b}_${s}`; if (h.c[a] != null && h.c[b] != null && B.couple[k] != null) { const d = Math.abs(h.c[a] - h.c[b]); if (d > B.couple[k] + COUPLE_SLACK) keys.push([`couple:${a}-${b}_${s}`, d - B.couple[k]]); } }
        for (const [k, v] of keys) { const r = (runs[k] ??= { v: 0, t: f.t, frames: 0 }); r.frames++; if (v > r.v) { r.v = v; r.t = f.t; } }
      }
    });
    out[n] = Object.entries(runs).filter(([, r]) => r.frames >= MIN).map(([k, r]) => ({ k, v: +r.v.toFixed(2), t: r.t, frames: r.frames })).sort((a, b) => b.frames - a.frames);
  }
  // ---- CALIBRATED kinds (how fingers sit against each other and the palm): a built clip is judged
  // against this body's own recordings — only past the worst real take (99.5th) by a margin. A loose
  // mocap curl read 2.6 radii "into the palm"; the measure is honest about skin it can't see.
  // Measured on a whole-body run, kept in hands-base.json for a partial one.
  const CAL = ["cross", "palm", "order", "tip"], kindOf = (k) => k.split(":")[0];
  if (!only) {
    const v = {}; for (const [n, f] of Object.entries(out)) if (!BUILT.test(n)) for (const x of f) if (CAL.includes(kindOf(x.k))) (v[kindOf(x.k)] ??= []).push(x.v);
    B.kinds = Object.fromEntries(CAL.map((k) => [k, v[k]?.length ? pct(v[k], 0.995) : 0]));
    fs.writeFileSync(BF, JSON.stringify(B, null, 1));
  }
  const MARGIN = { cross: 0.15, palm: 0.4, order: 0.3, tip: 10 };
  for (const n of Object.keys(out)) if (BUILT.test(n)) out[n] = out[n].filter((x) => !CAL.includes(kindOf(x.k)) || x.v > (B.kinds?.[kindOf(x.k)] ?? 0) + MARGIN[kindOf(x.k)]);
  const OF = path.join(ANIM, "hands.json");
  const merged = fs.existsSync(OF) && only ? { ...JSON.parse(fs.readFileSync(OF, "utf8")), ...out } : out;
  fs.writeFileSync(OF, JSON.stringify(merged, null, 1));
  // ---- the report: mocap clips with findings, and built clips' findings their base doesn't have
  // (and WHICH ARE NEW is kept too — hands-new.json: a built clip's findings its base recording doesn't have, what
  // RUBRIC.md A6 counts; the scorer read hands.json, where a recording's own loose curl counted against the clip)
  const NF = path.join(ANIM, "hands-new.json"), news = fs.existsSync(NF) && only ? JSON.parse(fs.readFileSync(NF, "utf8")) : {};
  let mocap = 0, ours = 0;
  const fmt = (x) => `${x.k} ${x.v}×${x.frames}@${x.t}`;
  for (const [n, f] of Object.entries(out)) {
    if (!f.length) continue;
    if (!BUILT.test(n)) { mocap++; if (process.argv.includes("--all")) console.log("  [mocap]", n.padEnd(50), f.slice(0, 4).map(fmt).join(", ")); continue; }
    const b = baseOf(n), bk = new Set((merged[b] ?? []).map((x) => x.k));
    const extra = f.filter((x) => !bk.has(x.k));
    news[n] = extra;
    if (extra.length) { ours++; console.log("  ", n.padEnd(52), extra.slice(0, 5).map(fmt).join(", ")); }
  }
  for (const n of Object.keys(out)) if (BUILT.test(n) && !out[n].length) news[n] = [];
  fs.writeFileSync(NF, JSON.stringify(news, null, 1));
  if (B.kinds) console.log(`${body}: the recordings reach`, JSON.stringify(B.kinds));
  console.log(`${body}: ${Object.keys(out).length} clips measured, ${ours} built clips with hand findings of their own, ${mocap} mocap clips with findings`);
  await browser.close();
})();
