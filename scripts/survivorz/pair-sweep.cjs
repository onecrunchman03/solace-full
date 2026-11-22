// SURVIVORZ: THE LAW ON A NEW BODY'S PAIRED MOVES, and the pairs table it may play (Nov 4 2026 — Josh:
// grabs, bites and rescues for the bodies the character creator bakes).
//
// The seven hand-made survivors' pairs were judged by sweeps run by hand into docs/survivorz/finisher-fit.json
// (scripts/survivorz/finisher-table.mjs) and turned into the show's pairs.json (pair-table.mjs). A creator body
// is judged here, alone, the same way: every zombie's half (zd-<move>-<body>, from pack-pairclips.mjs) played
// against the body's own half on anim-pair.html, placed where the bake placed them, and each body's skin read
// against the other's torso at 13 moments — the sixth-deepest vertex, under the line (3 cm, anim-pairs.mjs
// pairLine). A struggle is offered only WHOLE (grab, held, broken free: every link under the line); a bite
// only when its survivor half doesn't clip into its own body either (anim/<body>/clip.json, the law step).
// The rescue (the pull-off) is placed where its bake stood the zombie, as pair-table.mjs does.
//
//   node scripts/serve-root.mjs 8791            (bake.mjs starts it)
//   node scripts/survivorz/pair-sweep.cjs <survivor body>
//   → assets/downloads/survivorz/creator/<body>/pairs.json   { chains, bites, pull, judged }
const fs = require("fs"), path = require("path");
const npx = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const STAGE = path.join(__dirname, "..", "..", "assets", "downloads", "survivorz");
const X = process.argv[2];
if (!X || !/^[a-z0-9-]{2,32}$/.test(X)) throw new Error("usage: pair-sweep.cjs <survivor body>");
const CHAINS = {
  front: ["fz-front-struggle-start", "fz-front-struggle-start-idle", "fz-front-struggle-free"],
  back: ["fz-back-struggle-start", "fz-back-struggle-idle", "fz-back-struggle-free"],
};
const BITES = ["forearm", "shoulder"], REACH = 0.3;
const MOMENTS = 12;
const r3 = (x) => Math.round(x * 1000) / 1000;
const url = (p) => "/" + path.relative(path.join(__dirname, "..", ".."), p).split(path.sep).join("/");

(async () => {
  const { placeOf, pairLine } = await import(require("url").pathToFileURL(path.join(__dirname, "..", "..", "docs", "survivorz", "anim-pairs.mjs")).href);
  // the survivor halves that clip into their own body never play (the law step's measure, as anim-law-show reads it)
  const self = (() => { try { return JSON.parse(fs.readFileSync(path.join(STAGE, "anim", X, "clip.json"), "utf8")); } catch { return {}; } })();
  const selfBad = (clip, line) => { const r = self[clip]; return !!r && r.frames > 0 && r.depth > line && !/upperleg_twist|thigh_(twist|stretch)/.test(r.bone ?? ""); };
  const xJob = JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${X}.json`), "utf8"));
  const zombies = fs.readdirSync(path.join(STAGE, "game")).filter((f) => /^zombie-.*\.glb$/.test(f)).map((f) => f.slice(0, -4)).sort();
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  page.on("pageerror", (e) => console.log("page:", e.message));
  const chains = {}, bites = {}, pull = {}, judged = {};
  let offered = 0, tried = 0;
  for (const z of zombies) {
    const extra = path.join(STAGE, "creator", X, "pairclips", `${z}.glb`);
    if (!fs.existsSync(extra)) { console.log(`${z}: no halves packed for ${X}`); continue; }
    await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-pair.html?size=64&a=${url(path.join(STAGE, "game", `${z}.glb`))}&b=${url(path.join(STAGE, "game", `${X}.glb`))}&aextra=${url(extra)}`);
    await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
    const err = await page.evaluate(() => window.r.error); if (err) throw new Error(err);
    const line = pairLine(z, X);
    // the worst sixth-deepest vertex either way over the clip (metres), or null when a half is missing
    const worst = (o) => page.evaluate(([o, n]) => {
      let d;   // (r.use throws on a missing clip: that half wasn't baked)
      try { d = window.r.use(o.aname, o); } catch { return null; }
      let w = 0;
      // (a bite is judged on the HEADS too — either body's skin in the other's head, hair left out: the torso check stops at
      // the neck, and a shoulder bite with the zombie's face in the survivor's jaw read clean. Nov 11 2026)
      for (let i = 0; i <= n; i++) { const v = window.r.overlap((d * i) / n); w = Math.max(w, v.aInB.d6, v.bInA.d6, ...(o.heads ? [v.aInBHead.d6, v.bInAHead.d6] : [])); }
      return w;
    }, [o, MOMENTS]);
    const j = (judged[z] = { line, chains: {}, bites: {} });
    for (const [k, links] of Object.entries(CHAINS)) {
      const p = placeOf(links[0]);
      let whole = true;
      for (const c of links) {
        tried++;
        const d = await worst({ aname: `zd-${c}-${X}`, bname: c, bx: p.bx, bz: p.bz, byaw: p.byaw, ayaw: p.ayaw ?? 0, ay: p.ay ?? 0 });
        j.chains[c] = d == null ? null : r3(d);
        if (d == null || d > line + 1e-9) whole = false;
      }
      if (whole) { ((chains[z] ??= {})[X] ??= {})[k] = "fzfzfz"; offered++; }
    }
    for (const part of BITES) {
      tried++;
      const f = path.join(STAGE, "out", JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${z}.json`), "utf8")).out ?? z, `zd-bite-${part}-${X}.json`);
      const place = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).built?.place : null;
      if (!place) { j.bites[part] = null; continue; }
      const d = await worst({ aname: `zd-bite-${part}-${X}`, bname: `bd-bitten-${part}`, bx: place.x, bz: place.z, byaw: place.yaw, ayaw: 0, ay: 0, bonce: true, heads: true });
      j.bites[part] = d == null ? null : r3(d);
      // (A BITE THAT DOESN'T REACH IS NOT A BITE, Nov 14 2026 — bite-table.cjs REACH: the zombie's head bone must come
      // within 30 cm of the bitten place during the bite; held off it, a zombie stood with its mouth open and read clean)
      const near = d == null ? null : await page.evaluate((part) => {
        const bone = (S, re) => { let f = null; S.g.scene.traverse((x) => { if (!f && x.isBone && re.test(x.name)) f = x; }); return f; };
        const A = window.r.bodies.A, B = window.r.bodies.B, hd = bone(A, /^head\.?x?$/i) ?? bone(A, /head/i), V = hd.position.constructor, at = (b) => b.getWorldPosition(new V());
        const spot = part === "shoulder" ? () => at(bone(B, /(^|_)upperarm_l$/)) : () => at(bone(B, /(^|_)lowerarm_l$/)).lerp(at(bone(B, /(^|_)hand_l$/)), 0.55);
        let near = Infinity; for (let t = 0.4; t <= 2.0 + 1e-6; t += 0.1) { window.r.pose(t); near = Math.min(near, at(hd).distanceTo(spot())); }
        return near;
      }, part);
      (j.reach ??= {})[part] = near == null ? null : r3(near);
      if (d != null && d <= line + 1e-9 && !selfBad(`bd-bitten-${part}`, line) && near <= REACH) { ((bites[z] ??= {})[X] ??= {})[part] = [r3(place.x), r3(place.z), r3(place.yaw)]; offered++; }
    }
    const pf = path.join(STAGE, "out", xJob.out ?? X, `zv-pull-off-${z}.json`);
    const pp = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, "utf8")).built?.place : null;
    if (pp && !selfBad(`zv-pull-off-${z}`, line)) (pull[X] ??= {})[z] = [r3(pp.x), r3(pp.z), r3(pp.yaw)];
    console.log(`${z} with ${X}: ${Object.keys(chains[z]?.[X] ?? {}).join("+") || "no struggle"} · bites ${Object.keys(bites[z]?.[X] ?? {}).join("+") || "none"}${pull[X]?.[z] ? " · pull-off" : ""}  (worst ${Math.max(0, ...Object.values(j.chains).filter((v) => v != null), ...Object.values(j.bites).filter((v) => v != null)) * 100 | 0} cm, line ${line * 100} cm)`);
  }
  await browser.close();
  const out = path.join(STAGE, "creator", X, "pairs.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ body: X, at: Date.now(), chains, bites, pull, judged }, null, 0) + "\n");
  console.log(`${X}: ${offered} of ${tried} pair moves within the line, ${Object.keys(pull[X] ?? {}).length} pull-offs → ${path.relative(process.cwd(), out)}`);
  if (!offered && !Object.keys(pull[X] ?? {}).length) { console.error("no pair move passed: nothing to offer"); process.exit(1); }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
