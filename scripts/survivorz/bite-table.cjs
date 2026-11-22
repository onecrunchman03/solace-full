// SURVIVORZ: THE BITES A HAND-MADE BODY MAY TAKE, measured again (Nov 14 2026).
//
// docs/survivorz/finisher-fit.json says which bites (forearm, shoulder) each zombie may play on each of the seven
// bodies made by hand; it was written by finisher-table.mjs from sweeps run by hand, and those sweeps were scratch
// files. When a body's bitten clip or the zombies' halves on it are baked again, this measures that body's bites
// the law's way — the pair check a creator body gets (pair-sweep.cjs): the zombie's half against the survivor's on
// anim-pair.html where the bake placed them, each body's skin read against the other's torso and head at 13
// moments, the sixth-deepest vertex under the line (anim-pairs.mjs pairLine), never a bite whose survivor half
// clips into its own body (anim/<body>/clip.json), never one whose mouth doesn't get there (REACH) — and rewrites just those bodies' forearm and shoulder
// entries in the table (a leg bite is the ankle grab's and is left as it is). Then pair-table.mjs.
//
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/bite-table.cjs <body> [<body> ...]        --dry: measure and print, write nothing
// The zombies' packed files must carry the halves being measured: pack.mjs <zombie> first.
const fs = require("fs"), path = require("path");
const npx = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const ROOT = path.join(__dirname, "..", ".."), STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const dry = process.argv.includes("--dry"), bodies = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const HAND_MADE = ["carla", "claudia", "eric", "manuel", "nathan", "rollo", "sophia"];
if (!bodies.length || bodies.some((b) => !HAND_MADE.includes(b))) throw new Error(`usage: bite-table.cjs <body> [...] — one of ${HAND_MADE.join(", ")} (a creator body's table is pair-sweep.cjs's)`);
const PARTS = ["forearm", "shoulder"], MOMENTS = 12;
// A BITE THAT DOESN'T REACH IS NOT A BITE (Nov 14 2026): a zombie held off the bitten place — its head kept clear of the
// survivor's shoving hand — stood 40 cm away with its mouth open and read clean, because nothing touched: 16 of 19 on
// Carla. The zombie's head bone must come within REACH of the bitten place during the bite (a bite that lands reads
// 12-27 cm on the seven bodies, one that doesn't 34-54)
const REACH = 0.3;

(async () => {
  const { pairLine } = await import(require("url").pathToFileURL(path.join(ROOT, "docs", "survivorz", "anim-pairs.mjs")).href);
  const zombies = fs.readdirSync(path.join(STAGE, "game")).filter((f) => /^zombie-.*\.glb$/.test(f)).map((f) => f.slice(0, -4)).sort();
  const selfOf = (s) => { try { return JSON.parse(fs.readFileSync(path.join(STAGE, "anim", s, "clip.json"), "utf8")); } catch { return {}; } };
  const selfBad = (self, clip, line) => { const r = self[clip]; return !!r && r.frames > 0 && r.depth > line && !/upperleg_twist|thigh_(twist|stretch)/.test(r.bone ?? ""); };
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  page.on("pageerror", (e) => console.log("page:", e.message));
  const rows = [];
  for (const s of bodies) {
    const self = selfOf(s);
    for (const z of zombies) {
      await page.goto(`http://127.0.0.1:8791/scripts/survivorz/anim-pair.html?size=64&a=/assets/downloads/survivorz/game/${z}.glb&b=/assets/downloads/survivorz/game/${s}.glb`);
      await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
      const err = await page.evaluate(() => window.r.error); if (err) throw new Error(err);
      const line = pairLine(z, s);
      for (const part of PARTS) {
        const f = path.join(STAGE, "out", z, `zd-bite-${part}-${s}.json`);
        const place = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).built?.place : null;
        let d = null;
        if (place) d = await page.evaluate(([o, n]) => {
          let dur; try { dur = window.r.use(o.aname, o); } catch { return null; }
          let w = 0;
          for (let i = 0; i <= n; i++) { const v = window.r.overlap((dur * i) / n); w = Math.max(w, v.aInB.d6, v.bInA.d6, v.aInBHead.d6, v.bInAHead.d6); }
          // (and THE BITE MUST BE A BITE: how near the zombie's head bone comes to the bitten place, 0.4-2.0 s)
          const bone = (S, re) => { let f = null; S.g.scene.traverse((x) => { if (!f && x.isBone && re.test(x.name)) f = x; }); return f; };
          const A = window.r.bodies.A, B = window.r.bodies.B, hd = bone(A, /^head\.?x?$/i) ?? bone(A, /head/i), V = hd.position.constructor, at = (b) => b.getWorldPosition(new V());
          const spot = o.part === "shoulder" ? () => at(bone(B, /(^|_)upperarm_l$/)) : () => at(bone(B, /(^|_)lowerarm_l$/)).lerp(at(bone(B, /(^|_)hand_l$/)), 0.55);
          let near = Infinity; for (let t = 0.4; t <= 2.0 + 1e-6; t += 0.1) { window.r.pose(t); near = Math.min(near, at(hd).distanceTo(spot())); }
          return { w, near };
        }, [{ part, aname: `zd-bite-${part}-${s}`, bname: `bd-bitten-${part}`, bx: place.x, bz: place.z, byaw: place.yaw, ayaw: 0, ay: 0, bonce: true }, MOMENTS]);
        const own = selfBad(self, `bd-bitten-${part}`, line), near = d?.near ?? null; d = d?.w ?? null;
        rows.push({ z, s, k: part, d, near, ok: d != null && d <= line + 1e-9 && !own && near <= REACH, own });
      }
      console.log(`${z} on ${s}: ${PARTS.map((k) => { const r = rows.find((x) => x.z === z && x.s === s && x.k === k); return `${k} ${r.d == null ? "not baked" : (r.d * 100).toFixed(1) + " cm"}${r.own ? " (her own half clips)" : ""}${r.near != null && r.near > REACH ? ` (never reaches: ${(r.near * 100).toFixed(0)} cm off)` : ""} ${r.ok ? "ok" : "OFF"}`; }).join(" · ")}`);
    }
  }
  await browser.close();
  apply(rows);
})().catch((e) => { console.error(e.message || e); process.exit(1); });

function apply(rows) {
  const file = path.join(ROOT, "docs", "survivorz", "finisher-fit.json"), fit = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = {}, after = {};
  for (const r of rows) {
    const cur = new Set(fit.bites?.[r.z]?.[r.s] ?? []);
    (before[r.s] ??= { forearm: 0, shoulder: 0 })[r.k] += cur.has(r.k) ? 1 : 0;
    (after[r.s] ??= { forearm: 0, shoulder: 0 })[r.k] += r.ok ? 1 : 0;
    if (r.ok) cur.add(r.k); else cur.delete(r.k);
    const list = ["forearm", "shoulder", "leg"].filter((k) => cur.has(k));
    if (list.length) ((fit.bites ??= {})[r.z] ??= {})[r.s] = list; else if (fit.bites?.[r.z]) delete fit.bites[r.z][r.s];
  }
  for (const s of Object.keys(after)) console.log(`${s}: forearm ${before[s].forearm} → ${after[s].forearm}, shoulder ${before[s].shoulder} → ${after[s].shoulder} (of ${rows.filter((r) => r.s === s && r.k === "shoulder").length} zombies)`);
  if (dry) { console.log("--dry: nothing written"); return; }
  fs.writeFileSync(file, JSON.stringify(fit, null, 0) + "\n");
  console.log(`→ ${path.relative(ROOT, file)}; now: node scripts/survivorz/pair-table.mjs`);
}
