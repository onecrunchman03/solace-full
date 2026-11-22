// SURVIVORZ: THE WORN KIT, FITTED AND MEASURED (Oct 28 2026 — Josh: "there are backpacks and make sure
// they can wear them and utilize them properly, do an equipment validation check").
//
// For each survivor body and each backpack: places the pack by the show's own maths
// (client/src/survivorz/show/kit.ts — the chest frame built from bone positions), then plays every clip
// the show wears a pack on (WORN_CLIPS) through three's skinning in plain Node and measures how far the
// body goes INTO the pack: each skin vertex taken into the pack's own frame and tested against the pack's
// solid (2 cm columns of its own mesh — the panel is the face toward the wearer). The fit is the smallest
// distance behind the chest at which the torso never sinks into the pack past LINE (3 cm, the animation
// law's line; Rollo's suit 6 — the same allowance the law gives his padding), and the arms (which brush a
// pack's sides as they swing, as real arms do) are reported beside it. `--write` writes the numbers into
// client/src/survivorz/show/kit-fit.json, which the show reads.
//   node --max-old-space-size=4096 scripts/survivorz/kit-fit.mjs [--only carla,eric] [--write]
// --out <file> (with --only): the named bodies' fits into that file instead ({ packs, stow } for them alone) —
// the creator's bake does this (bake.mjs "kit"), and the server keeps a creator body's fit on its own shelf.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { THREE, ROOT, STAGE, loadBody, boneLike } from "./lib-loadbody.mjs";

const KIT = await import(pathToFileURL(path.join(ROOT, "client", "src", "survivorz", "show", "kit.ts")).href);
const S = await import(pathToFileURL(path.join(ROOT, "client", "src", "survivorz", "show", "stance.ts")).href);
const FIT_FILE = path.join(ROOT, "client", "src", "survivorz", "show", "kit-fit.json");
const args = process.argv.slice(2);
const only = (() => { const i = args.indexOf("--only"); return i >= 0 ? args[i + 1].split(",") : null; })();
const OUT = (() => { const i = args.indexOf("--out"); return i >= 0 ? args[i + 1] : ""; })();
if (OUT && !only) { console.error("--out needs --only <body>"); process.exit(1); }
const WRITE = args.includes("--write") && !OUT;
// ROLLO WEARS NO PACK: his hazmat suit carries its own air pack, the full width of his back from the
// shoulders to the waist and 20 cm deep (rollo-build.py). Fitted, a backpack rode 18 cm further out than on
// anyone else, on top of the tank — a pack on a pack, the very glitch Josh flagged on his back. His kit
// still counts it (the sim's slots); the screen draws the suit.
const NO_PACK = new Set(["rollo"]);
// (any body can be fitted by name — a creator-made one too: --only swat-soldier. With no --only, the first six.)
const SURVIVORS = only ? only.filter((b) => !NO_PACK.has(b)) : ["carla", "claudia", "eric", "manuel", "nathan", "sophia"];
const PACKS = ["backpack-small", "backpack-large"];
const LINE = 0.03, SUIT = { rollo: 0.03 };
// THE BIG PACK IS MODELLED 1.08 m TALL (a 0.5 m wide expedition pack — measured off its mesh): at 0.64 it is
// a real 60-litre hiking pack, 0.69 m tall and 0.32 wide — narrow enough for a swinging elbow to pass it
const LARGE_SCALE = 0.64;

/** every clip the show plays with a pack ON (kit.ts PACK_OFF lists the ones it takes it off for) */
const WORN_CLIPS = [...S.CLIP_NAMES].filter((n) => !KIT.packOff(n) && !/zombie/.test(n));

/** fitted by the PUSH, never the base: the grab struggle's braced squat */
const PUSH_ONLY = /^fza-|struggle/;
/** THE BASE the pack is fitted to: how a body stands and walks about. Everything else — a run's forward
 *  lean, a crouch, a gun held up, a swing — rides the PUSH (a tall pack laid on a standing back has its
 *  bottom shoved by the small of the back when the chest pitches forward: Carla's jog needed 17 cm) */
const BASE = new Set(["ual1-idle-loop", "ual1-walk-loop", "ual1-idle-talking-loop", "ual2-idle-foldarms-loop", "bd-flashlight-walk", "ual1-interact", "bd-eat", "bd-drink", "bd-bandage"]);
/** the loops (what a body STAYS in): the fit is made against these */
const LOOPS = new Set([...Object.values(S.READY_LOOPS), ...Object.values(S.CALM_LOOPS)].flatMap((row) => Object.values(row).flat().flatMap((n) => (n.includes("{k}") ? S.MELEE_KEYS.map((k) => n.replace("{k}", k)) : [n]))).concat([S.CRAWL, "ual2-idle-foldarms-loop"]));
const bad = [], notes = [];
const prev = fs.existsSync(FIT_FILE) ? JSON.parse(fs.readFileSync(FIT_FILE, "utf8")) : { packs: {}, stow: {} };
const out = { packs: { ...prev.packs }, stow: prev.stow ?? {} };
for (const b of NO_PACK) delete out.packs[b];

// ---- the packs' solids: a ray down z through every 1 cm column of the pack's own (x, y), its crossings
// with the mesh paired into intervals (in, out) — a bag is solid between its panel and its front, a hip
// belt's wing or a strap is its own thin interval, and the gap between a wing and the bag is air ----
const CELL = 0.01;
const solids = {};
for (const id of PACKS) {
  const g = await loadBody(path.join(STAGE, "props", `${id}.glb`)); g.scene.updateMatrixWorld(true);
  const tris = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, ix = o.geometry.index;
    const P = (i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
    const n = ix ? ix.count : p.count;
    const trim = KIT.PACK_TRIM[id];
    const cut = (q) => trim && q.y < trim.yBelow && q.z < trim.zBelow;   // (kit.ts PACK_TRIM: the big pack's hip belt)
    for (let t = 0; t < n; t += 3) { const tri = [P(ix ? ix.getX(t) : t), P(ix ? ix.getX(t + 1) : t + 1), P(ix ? ix.getX(t + 2) : t + 2)]; if (!tri.every(cut)) tris.push(tri); }
  });
  const box = new THREE.Box3(); for (const t of tris) for (const q of t) box.expandByPoint(q);
  const solid = new Map();
  for (let cx = Math.floor(box.min.x / CELL); cx <= Math.floor(box.max.x / CELL); cx++) for (let cy = Math.floor(box.min.y / CELL); cy <= Math.floor(box.max.y / CELL); cy++) {
    const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL, zs = [];
    for (const [a, b, c] of tris) {
      // the (x, y) point in the triangle's xy projection (barycentric), its z there
      const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d, l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      zs.push(l1 * a.z + l2 * b.z + l3 * c.z);
    }
    if (zs.length < 2) continue;
    zs.sort((p, q) => p - q);
    const hits = []; for (const z of zs) if (!hits.length || z - hits[hits.length - 1] > 0.004) hits.push(z);
    const iv = []; for (let i = 0; i + 1 < hits.length; i += 2) iv.push([hits[i], hits[i + 1]]);
    if (iv.length) solid.set(`${cx},${cy}`, iv);
  }
  solids[id] = solid;
  console.log(`${id}: ${tris.length} triangles, ${solid.size} solid columns`);
}
/** the interval of the pack a pack-local point is inside, or null */
const insideOf = (id, p) => {
  const iv = solids[id].get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`);
  if (!iv) return null;
  for (const r of iv) if (p.z > r[0] && p.z < r[1]) return r;
  return null;
};

const ARMISH = /arm|hand|clavicle|shoulder|finger|thumb|index|middle|ring|pinky|elbow|wrist/i;

for (const body of SURVIVORS) {
  const g = await loadBody(path.join(STAGE, "game", `${body}.glb`), (n) => WORN_CLIPS.includes(n));
  const scene = g.scene; scene.updateMatrixWorld(true);
  const bone = (n) => boneLike(scene, n);
  const mixer = new THREE.AnimationMixer(scene);
  const clips = g.animations;
  // the skin: every vertex of the drawn meshes (never the person inside Rollo's suit), each marked arm
  // or torso by its heaviest bone; legs below the hips are out of a pack's way and skipped
  const verts = [];
  scene.traverse((m) => {
    if (!m.isSkinnedMesh || /body_proxy/.test(m.name)) return;
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      let best = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; best = si.getComponent(i, j); } }
      const bn = m.skeleton.bones[best]?.name ?? "";
      if (/leg|foot|toe|calf|thigh|knee|ball/i.test(bn)) continue;
      verts.push({ m, i, arm: ARMISH.test(bn) });
    }
  });
  const line = LINE + (SUIT[body] ?? 0);
  const M = new THREE.Matrix4(), inv = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const pack of PACKS) {
    // where the bottom sits: the daypack's on the small of the back, the big pack's hip belt round the hips
    // (measured standing: the bones keep whatever pose the last clip measured left them in)
    { mixer.stopAllAction(); const a0 = mixer.clipAction(clips.find((c) => c.name === "ual1-idle-loop")); a0.reset().play(); a0.time = 0; mixer.update(0); scene.updateMatrixWorld(true); a0.stop(); }
    const F0 = KIT.bodyFrame(bone);
    const hipY = bone("hip").getWorldPosition(new THREE.Vector3()), chest = new THREE.Vector3(...F0.o);
    const s1 = bone("spine_01").getWorldPosition(new THREE.Vector3());
    // (both ride ABOVE the seat: at the hips a squat or a braced stance shoves the butt into the pack bottom —
    // measured, the grab struggle stood the big pack 23 cm off the back from the hips)
    const up = s1.clone().sub(chest).dot(new THREE.Vector3(...F0.up)) + (pack === "backpack-small" ? 0.02 : -0.02);
    const scale = pack === "backpack-large" ? LARGE_SCALE : 1;
    const fitAt = (back) => ({ back, up: +up.toFixed(3), tilt: 4, scale });
    /** per clip at `back`: the worst torso and arm depth into the pack, and how much FURTHER back the pack
     *  must go for no torso vertex to be inside it (moving it back slides the body out along its z) */
    const measure = (back, list, push = {}) => {
      KIT.setKitFit({ packs: { [body]: { [pack]: fitAt(back) } }, stow: {} });
      const res = [];
      for (const c of list) {
        mixer.stopAllAction(); const a = mixer.clipAction(c); a.reset().play();
        let torso = 0, arm = 0, need = 0, at = 0, why = "", gap = Infinity;
        for (let f = 0; f < 10; f++) {
          a.time = c.duration * (f + 0.5) / 10; mixer.update(0); scene.updateMatrixWorld(true);
          KIT.packMatrix(body, pack, bone, M, push[c.name] ?? 0); inv.copy(M).invert();
          let g = Infinity;
          for (const q of verts) {
            // (g: how close the back comes to the panel this frame; the clip keeps its best frame)
            q.m.getVertexPosition(q.i, v); v.applyMatrix4(q.m.matrixWorld).applyMatrix4(inv);
            const r = insideOf(pack, v);
            if (!r) { if (!q.arm) { const iv = solids[pack].get(`${Math.floor(v.x / CELL)},${Math.floor(v.y / CELL)}`); if (iv && v.z < iv[0][0]) g = Math.min(g, iv[0][0] - v.z); } continue; }
            const d = Math.min(v.z - r[0], r[1] - v.z);
            if (q.arm) { arm = Math.max(arm, d); continue; }
            if (d > torso) { torso = d; at = a.time; }
            if (v.z - r[0] > need) { need = v.z - r[0]; why = `${(r[1] - r[0]).toFixed(2)} thick at y ${v.y.toFixed(2)} x ${v.x.toFixed(2)}`; }
          }
          if (torso === 0) gap = Math.min(gap, g);
        }
        a.stop();
        res.push({ clip: c.name, torso, arm, need, at, why, gap });
      }
      return res;
    };
    // THE BASE: measure at a pack sunk into the back, read how far each ordinary LOOP (standing,
    // walking, running, crouching, the guns' loops — what a body stays in) needs it moved back (the torso
    // may rest on the panel up to a third of the law's line), move it, measure again.
    // THE PUSH: every clip that still sinks the torso in at the base — a braced struggle shoving the seat
    // back, a lunge — gets its own extra distance, and the show blends it in by that clip's weight: the
    // pack rides out on its straps when the body bends, and sits ON the back the rest of the time. (Fitted
    // to the worst clip instead, the grab struggle stood Manuel's pack 15 cm off his back all show long.)
    const loops = clips.filter((c) => BASE.has(c.name));
    const allow = line * 0.34;
    let back = 0.04, r = null;
    for (let pass = 0; pass < 4; pass++) {
      r = measure(back, loops);
      const worst = Math.max(...r.map((x) => x.need));
      if (process.argv.includes("--why")) { const w = r.find((x) => x.need === worst); console.log(`  pass ${pass} back ${back}: need ${worst.toFixed(3)} from ${w.clip} (${w.why})`); }
      if (worst <= allow) break;
      back = +(back + worst - allow + 0.004).toFixed(3);
    }
    r = measure(back, clips);
    const push = {};
    for (const x of r) if (x.need > allow + 0.005) push[x.clip] = +(x.need - allow + 0.004).toFixed(3);
    // checked again with each clip's push on: nothing past the law's line, and how close the panel sits
    const pushed = clips.filter((c) => push[c.name]);
    const r2 = new Map(pushed.length ? measure(back, pushed, push).map((x) => [x.clip, x]) : []);
    const fin = r.map((x) => r2.get(x.clip) ?? x);
    const past = fin.filter((x) => x.torso > line);
    if (past.length) bad.push(...past.map((x) => `${body} ${pack}: ${x.clip} sinks the torso ${(x.torso * 100).toFixed(1)} cm into the pack (${x.why})`));
    const armPast = fin.filter((x) => x.arm > line);
    if (armPast.length) notes.push(`${body} ${pack}: an arm ${armPast.map((x) => `${x.clip} ${(x.arm * 100).toFixed(1)}cm`).join(", ")} into the pack (a strap's run over the shoulder reads as inside it)`);
    const idle = fin.find((x) => x.clip === "ual1-idle-loop");
    const worstP = Object.entries(push).sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log(`${body} ${pack}: back ${back.toFixed(3)} m, up ${up.toFixed(2)} m, scale ${scale} · standing: the panel ${idle ? (idle.gap * 100).toFixed(1) : "?"} cm off the back · worst torso ${(Math.max(...fin.map((x) => x.torso)) * 100).toFixed(1)} cm · pushes ${Object.keys(push).length} clips (${worstP.map(([k, v]) => `${k} +${(v * 100).toFixed(0)}cm`).join(", ")})`);
    (out.packs[body] ??= {})[pack] = { ...fitAt(+back.toFixed(3)), push };
  }
}
for (const n of notes) console.log("  note:", n);
for (const b of bad) console.log("  FAIL:", b);
if (WRITE) { fs.writeFileSync(FIT_FILE, JSON.stringify(out, null, 1)); console.log("wrote", path.relative(ROOT, FIT_FILE)); }
if (OUT) {
  // (only these bodies; a stow fit already in the file is kept — kit-stow.mjs writes that half next)
  const was = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const mine = { packs: {}, stow: {} };
  for (const b of only) { if (out.packs[b]) mine.packs[b] = out.packs[b]; if (was.stow?.[b]) mine.stow[b] = was.stow[b]; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(mine, null, 1) + "\n");
  console.log("wrote", OUT);
  // (a body with a pack fitted for neither pack is a failure; a pack that rubs is printed above and kept)
  if (SURVIVORS.some((b) => !PACKS.some((p) => mine.packs[b]?.[p]))) process.exit(1);
}
