// SURVIVORZ: runs THE ANIMATION LAW's natural half (scripts/survivorz/anim-natural.js) over every
// clip packed into a body, against the range that body's own motion-capture clips cover, and lists
// every clip that leaves it — the joint, how far, and when.
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/anim-natural.cjs <body> [substr]   -> anim/<body>/natural.json
// The baseline is every clip NOT built in code (bd-, gr-, gs-, gp-) and not a finisher pair (fz-).
// It is cached in anim/<body>/natural-base.json; --rebase measures it again.
const fs = require("fs"), path = require("path");
const npx = path.join(process.env.LOCALAPPDATA, "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.readdirSync(npx)) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const ROOT = path.join(__dirname, "..", "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [body, only] = args;
const BUILT = /^(bd|gr|gs|gp|hd)-/, SKIP = /^fz-/;
// (a survivor carries the zombie moves too, for the turn: they are measured, never part of what a
// living body's natural range is built from)
const ZOMBIE_SET = /^(mx-zombie|ual2-zombie|hw-|fza-)/;
const ANIM = path.join(ROOT, "assets", "downloads", "survivorz", "anim", body);
const index = fs.existsSync(path.join(ANIM, "index.json")) ? JSON.parse(fs.readFileSync(path.join(ANIM, "index.json"), "utf8")) : {};
const loops = (n) => !!index[n]?.loop;
// how far past the baseline still reads as natural, per kind (degrees; speed/jerk as a ratio)
const SLACK = { angle: 8, ratio: 1.25 };
const pct = (a, p) => { const v = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))] : null; };
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-render.html?body=/assets/downloads/survivorz/game/${body}.glb&size=64`);
  await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
  const e = await page.evaluate(() => window.r.error); if (e) throw new Error(e);
  const all = (await page.evaluate(() => window.r.clips())).map((c) => c.name).filter((n) => !SKIP.test(n));
  const measure = (n) => page.evaluate(([n, l]) => window.r.natural(n, 30, l), [n, loops(n)]);
  // ---- the baseline: what real bodies did
  const BF = path.join(ANIM, "natural-base.json");
  let B;
  if (fs.existsSync(BF) && !process.argv.includes("--rebase")) B = JSON.parse(fs.readFileSync(BF, "utf8"));
  else {
    const vals = {}, speed = {}, jerk = {};
    for (const n of all.filter((n) => !BUILT.test(n) && (!require("./bodies.cjs").survivorIds().includes(body) || !ZOMBIE_SET.test(n)))) {
      const m = await measure(n);
      for (const p of m.poses) for (const [k, v] of Object.entries(p)) if (v != null) (vals[k] ??= []).push(v);
      for (const [b, [v]] of Object.entries(m.motion.speed)) (speed[b] ??= []).push(v);
      for (const [b, [v]] of Object.entries(m.motion.jerk)) (jerk[b] ??= []).push(v);
    }
    B = { range: {}, core: {}, hinge: {}, speed: {}, jerk: {} };
    for (const [k, v] of Object.entries(vals)) if (!/^elbowDir|^hingeDir|^hingeBend/.test(k)) B.range[k] = [pct(v, 0.003), pct(v, 0.997)];
    // where most real motion sits (5th-95th): what the bake's arm solver prefers to stay inside
    B.core = {}; for (const [k, v] of Object.entries(vals)) if (!/^elbowDir|^hingeDir|^hingeBend/.test(k)) B.core[k] = [pct(v, 0.05), pct(v, 0.95)];
    // every hinge's bending way (knees, elbows, finger knuckles), as the elbow's
    for (const k of Object.keys(vals).filter((k) => k.startsWith("hingeDir:"))) {
      const bn = k.slice(9), bends = vals["hingeBend:" + bn] ?? [];
      const dirs = vals[k].filter((d, i) => bends[i] > 25);
      if (dirs.length < 50) continue;
      const sx = dirs.reduce((a, d) => a + Math.cos(d / 57.3), 0), sy = dirs.reduce((a, d) => a + Math.sin(d / 57.3), 0);
      const mean = Math.atan2(sy, sx) * 57.3;
      const off = vals[k].map((d, i) => (bends[i] > 15 ? angDiff(d, mean) : null));
      B.hinge[bn] = { mean: +mean.toFixed(1), max: pct(off, 0.997) };
    }
    // the elbow's hinge way: the circular mean of its bend direction once really bent
    for (const s of ["l", "r"]) {
      const dirs = vals["elbowDir_" + s].filter((d, i) => vals["elbowBend_" + s][i] > 30);
      const sx = dirs.reduce((a, d) => a + Math.cos(d / 57.3), 0), sy = dirs.reduce((a, d) => a + Math.sin(d / 57.3), 0);
      const mean = Math.atan2(sy, sx) * 57.3;
      const off = vals["elbowDir_" + s].map((d, i) => (vals["elbowBend_" + s][i] > 20 ? angDiff(d, mean) : null));
      B.hinge[s] = { mean: +mean.toFixed(1), max: pct(off, 0.997) };
    }
    // a clip's fastest and most sudden: the baseline's top 3% of clips (falls and hits included)
    for (const [b, v] of Object.entries(speed)) B.speed[b] = pct(v, 0.97);
    for (const [b, v] of Object.entries(jerk)) B.jerk[b] = pct(v, 0.97);
    fs.writeFileSync(BF, JSON.stringify(B, null, 1));
  }
  // ---- FINGERS ARE POOLED ACROSS THE CAST (Oct 23 2026): recorded fingers barely move — one body's
  // thumb base spanned 60 degrees on an axis — and each body's range came from its own copies of the
  // recordings, so Carla's thumb couldn't swing clear of a gun's receiver a degree past her own while
  // Manuel's recordings went 9 further. A finger joint may go where ANY survivor's recorded finger
  // went: the union of every body's own finger ranges (kept as ownFingers, so pooling is repeatable)
  {
    const FINGER = /^j:(thumb|index|middle|ring|pinky)_0[123]_[lr]:[xyz]$/;
    B.ownFingers ??= Object.fromEntries(Object.entries(B.range).filter(([k]) => FINGER.test(k)));
    const root = path.join(ROOT, "assets", "downloads", "survivorz", "anim");
    for (const other of fs.readdirSync(root)) {
      const f = path.join(root, other, "natural-base.json"); if (other === body || /^zombie|^pairs$/.test(other) || !fs.existsSync(f)) continue;
      const O = JSON.parse(fs.readFileSync(f, "utf8")), own = O.ownFingers ?? Object.fromEntries(Object.entries(O.range ?? {}).filter(([k]) => FINGER.test(k)));
      for (const [k, [lo, hi]] of Object.entries(own)) if (B.range[k]) B.range[k] = [Math.min(B.range[k][0], lo), Math.max(B.range[k][1], hi)];
    }
    for (const [k, v] of Object.entries(B.ownFingers)) if (!B.range[k]) B.range[k] = v;
    fs.writeFileSync(BF, JSON.stringify(B, null, 1));
  }
  // ---- every clip against it
  const report = {};
  for (const n of all.filter((n) => !only || n.includes(only))) {
    const m = await measure(n), bad = [];
    m.poses.forEach((p, i) => {
      const t = +(i / 30).toFixed(2);
      for (const [k, v] of Object.entries(p)) {
        if (v == null || /^elbowDir|^elbowBend|^hingeDir|^hingeBend/.test(k) || !B.range[k]) continue;
        const [lo, hi] = B.range[k], past = v > hi + SLACK.angle ? v - hi : v < lo - SLACK.angle ? lo - v : 0;
        if (past) bad.push({ k, t, v: +v.toFixed(0), past: +past.toFixed(0) });
      }
      for (const [bn, H] of Object.entries(B.hinge)) {
        if (bn === "l" || bn === "r") continue;
        if (p["hingeBend:" + bn] > 15 && p["hingeDir:" + bn] != null) {
          const off = angDiff(p["hingeDir:" + bn], H.mean), past = off - H.max - SLACK.angle;
          if (past > 0) bad.push({ k: "hinge:" + bn, t, v: +off.toFixed(0), past: +past.toFixed(0) });
        }
      }
      for (const s of ["l", "r"]) {
        if (p["elbowBend_" + s] > 20 && p["elbowDir_" + s] != null) {
          const off = angDiff(p["elbowDir_" + s], B.hinge[s].mean), past = off - B.hinge[s].max - SLACK.angle;
          if (past > 0) bad.push({ k: "elbowHinge_" + s, t, v: +off.toFixed(0), past: +past.toFixed(0) });
        }
      }
    });
    for (const kind of ["speed", "jerk"]) for (const [b, [v, t]] of Object.entries(m.motion[kind])) {
      const lim = B[kind][b]; if (lim && v > lim * SLACK.ratio) bad.push({ k: `${kind}_${b}`, t: +t.toFixed(2), v: Math.round(v), past: +(v / lim).toFixed(2) });
    }
    // one line per measure: its worst moment
    const worst = {};
    for (const x of bad) if (!worst[x.k] || x.past > worst[x.k].past) worst[x.k] = { ...x, frames: bad.filter((y) => y.k === x.k).length };
    if (Object.keys(worst).length) report[n] = Object.values(worst).sort((a, b) => b.past - a.past);
  }
  // (a run on some clips keeps the rest of the file: it used to write only what it had just measured, and one
  // clip's check wiped the body's whole report — Nov 14 2026)
  if (only) { const NF = path.join(ANIM, "natural.json"), prev = fs.existsSync(NF) ? JSON.parse(fs.readFileSync(NF, "utf8")) : {}; for (const n of Object.keys(prev)) if (!n.includes(only) && !(n in report)) report[n] = prev[n]; }
  fs.writeFileSync(path.join(ANIM, "natural.json"), JSON.stringify(report, null, 1));
  const built = Object.keys(report).filter((n) => BUILT.test(n)), mocap = Object.keys(report).filter((n) => !BUILT.test(n));
  console.log(`${body}: ${all.filter((n) => !only || n.includes(only)).length} clips measured, ${built.length} built + ${mocap.length} mocap leave the natural range`);
  for (const n of [...built, ...mocap]) console.log(`  ${n}: ${report[n].slice(0, 4).map((x) => `${x.k} ${x.v}${/speed|jerk/.test(x.k) ? ` (${x.past}x)` : `° (+${x.past})`} @${x.t}s×${x.frames}`).join(", ")}`);
  await browser.close();
})();
