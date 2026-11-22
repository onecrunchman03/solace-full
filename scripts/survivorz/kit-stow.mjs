// SURVIVORZ: THE STOWED KIT, FITTED AND MEASURED (Oct 28 2026 — Josh: "do an equipment validation check").
// What a survivor owns and isn't holding is drawn ON them (show/actors.ts): the pistol in a holster down
// the right thigh, a knife or hammer through the belt on the left, a long tool or the rifle slung across
// the back — or strapped down the side of a worn pack. This script places each per body from the body's
// own shape (measured standing: how far out the thigh is, how far back the back is) and then plays every
// loop the show uses with each one on, measuring how deep any skin vertex goes INTO the item (the item's
// own solid: rays through its mesh, so an axe is a haft and a blade, not the box round both): the torso
// and legs may pass no more than the law's 15 vertices into it at any moment, arms are
// reported (an arm brushing a holster as it swings is a real thing, not a clip). Writes the `stow` half of
// client/src/survivorz/show/kit-fit.json with --write (kit-fit.mjs writes the packs; run it first).
//   node --max-old-space-size=4096 scripts/survivorz/kit-stow.mjs [--only carla] [--write]
// --out <file> (with --only): reads the named bodies' pack fits from that file (kit-fit.mjs --out wrote them) and
// writes their stow fits into it — the creator's bake (bake.mjs "kit").
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
const SLOTS = (() => { const i = args.indexOf("--slots"); return i >= 0 ? args[i + 1] : ""; })();   // (refit only slots containing this)
// (any body can be fitted by name — a creator-made one too: --only swat-soldier. With no --only, the first seven.)
const SURVIVORS = only ?? ["carla", "claudia", "eric", "manuel", "nathan", "rollo", "sophia"];
const LINE = 0.03, SUIT = { rollo: 0.03 };
const fit = JSON.parse(fs.readFileSync(FIT_FILE, "utf8"));
// (--out: the pack fits this run stands on are the file's own, laid over the show's)
const outWas = OUT && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
for (const b of OUT ? only : []) { if (outWas.packs?.[b]) fit.packs[b] = outWas.packs[b]; delete fit.stow?.[b]; }
KIT.setKitFit(fit);
fit.stow ??= {};

const n3 = (v) => { const l = Math.hypot(...v); return v.map((c) => +(c / l).toFixed(3)); };
const crossv = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// THE PLAN, per item: the frame, which way its own axes lie (frame directions: right, up, forward), the
// pivot (its own metres) and where that goes, from the body's measures `m` (thigh: out = how far out the
// thigh's skin reaches; back = how far behind the chest the back reaches; pack: its side, centre, depth)
const DIAG = 0.58; // the sling's lean off vertical (a strap from one shoulder to the other hip)
const PLAN = {
  // muzzle down, slide forward, the grip up at the belt
  // (BEHIND the hips, not down the thigh's side: a hanging hand rests exactly where a side holster goes —
  // measured, 86 of Carla's hand vertices in it as she stood; at four o'clock it's clear of a swinging arm)
  // the pistol muzzle down at the right back of the belt, its flat against the seat
  holster: { id: "pistol", frame: "hip", y: [1, 0, 0], z: [0, -1, 0], pivot: [0, 0.02, 0.06], at: (m) => [0.1, 0.0, -(m.seat + 0.028)] },
  // the head up at the belt, the handle down the thigh, the flat of it against the leg
  "belt:claw-hammer": { id: "claw-hammer", frame: "hip", y: [0, 1, 0], z: [0, 0, -1], pivot: [0, 0.29, 0], at: (m) => [-0.1, 0.06, -(m.seat + 0.03)] },
  // in a sheath: handle up, the blade down the thigh, its flat to the leg
  "belt:chef-knife": { id: "chef-knife", frame: "hip", y: [0, 0, -1], z: [0, 1, 0], pivot: [0, 0.008, 0.05], at: (m) => [-0.1, 0.0, -(m.seat + 0.012)] },
  // across the back, one shoulder to the other hip
  "back:crowbar": { id: "crowbar", frame: "chest", y: [-DIAG, 1, 0], z: [0, 0, -1], pivot: [0, 0.31, 0], at: (m) => [0, -0.16, -(m.back + 0.025)] },
  "back:lead-pipe": { id: "lead-pipe", frame: "chest", y: [-DIAG, 1, 0], z: [0, 0, -1], pivot: [0, 0.29, 0], at: (m) => [0, -0.16, -(m.back + 0.03)] },
  // (the axe is modelled along x, the head at −x: head up over the right shoulder, the blade flat on the back)
  "back:fire-axe-a": { id: "fire-axe-a", frame: "chest", x: [-DIAG, -1, 0], y: [0, 0, -1], pivot: [0, 0.03, 0], at: (m) => [0, 0.04, -(m.back + 0.08)] },
  // the carbine slung muzzle up over the left shoulder, its top away from the back
  "back:hk416": { id: "hk416", frame: "chest", z: [-DIAG, 1, 0], y: [0, 0, -1], pivot: [0, 0.06, 0.17], at: (m) => [0, -0.12, -(m.back + 0.05)] },
};
// with a pack: strapped down its side — the rifle on the left, a tool on the right — standing up with the pack
for (const pack of ["backpack-small", "backpack-large"]) {
  PLAN[`${pack}:hk416`] = { id: "hk416", frame: "chest", z: [0, 1, -0.08], y: [-1, 0, 0], pivot: [0, 0.06, 0.17], at: (m) => [-(m.pack[pack].half + 0.035), m.pack[pack].mid + 0.08, -m.pack[pack].depth] };
  for (const [id, piv] of [["crowbar", 0.31], ["lead-pipe", 0.29]]) PLAN[`${pack}:${id}`] = { id, frame: "chest", y: [0, 1, -0.08], z: [1, 0, 0], pivot: [0, piv, 0], at: (m) => [m.pack[pack].half + 0.02, m.pack[pack].mid + 0.05, -m.pack[pack].depth] };
  PLAN[`${pack}:fire-axe-a`] = { id: "fire-axe-a", frame: "chest", x: [0, -1, 0.08], y: [1, 0, 0], pivot: [0, 0.03, 0], at: (m) => [m.pack[pack].half + 0.05, m.pack[pack].mid + 0.05, -m.pack[pack].depth] };
}
/** the plan's two axes as the y and z kitFit stores */
const axesOf = (p) => {
  if (p.y && p.z) return { y: n3(p.y), z: n3(p.z) };
  if (p.x && p.y) { const x = n3(p.x), y = n3(p.y); return { y, z: n3(crossv(x, y)) }; }
  throw new Error("plan needs y+z or x+y");
};

// ---- the items' solids (their own space): rays along each item's thinnest axis through a 5 mm grid of
// the other two, the crossings with its mesh paired into in/out intervals — an axe's haft is a thin rod
// and its head a blade, not the box round both ----
const solidOf = {};
const GRID = 0.005;
for (const id of new Set(Object.values(PLAN).map((p) => p.id))) {
  const file = ["pistol", "hk416", "shotgun"].includes(id) ? path.join(STAGE, "props", "guns", `${id}.glb`) : path.join(STAGE, "props", `${id}.glb`);
  const g = await loadBody(file); g.scene.updateMatrixWorld(true);
  const tris = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, ix = o.geometry.index, P = (i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
    const n = ix ? ix.count : p.count;
    for (let t = 0; t < n; t += 3) tris.push([P(ix ? ix.getX(t) : t), P(ix ? ix.getX(t + 1) : t + 1), P(ix ? ix.getX(t + 2) : t + 2)]);
  });
  const box = new THREE.Box3(); for (const t of tris) for (const q of t) box.expandByPoint(q);
  const size = box.getSize(new THREE.Vector3()).toArray();
  const ax = size.indexOf(Math.min(...size)), [u, w] = [0, 1, 2].filter((k) => k !== ax);
  const cells = new Map();
  for (const [a, b, c] of tris) {
    const lo = [Math.min(a.getComponent(u), b.getComponent(u), c.getComponent(u)), Math.min(a.getComponent(w), b.getComponent(w), c.getComponent(w))];
    const hi = [Math.max(a.getComponent(u), b.getComponent(u), c.getComponent(u)), Math.max(a.getComponent(w), b.getComponent(w), c.getComponent(w))];
    for (let cu = Math.floor(lo[0] / GRID); cu <= Math.floor(hi[0] / GRID); cu++) for (let cw = Math.floor(lo[1] / GRID); cw <= Math.floor(hi[1] / GRID); cw++) {
      const x = (cu + 0.5) * GRID, y = (cw + 0.5) * GRID;
      const A = [a.getComponent(u), a.getComponent(w)], B = [b.getComponent(u), b.getComponent(w)], C = [c.getComponent(u), c.getComponent(w)];
      const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
      if (Math.abs(d) < 1e-14) continue;
      const l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / d, l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const k = `${cu},${cw}`; (cells.get(k) ?? cells.set(k, []).get(k)).push(l1 * a.getComponent(ax) + l2 * b.getComponent(ax) + l3 * c.getComponent(ax));
    }
  }
  const solid = new Map();
  for (const [k, zs] of cells) {
    zs.sort((p, q) => p - q);
    const hits = []; for (const z of zs) if (!hits.length || z - hits[hits.length - 1] > 0.002) hits.push(z);
    const iv = []; for (let i = 0; i + 1 < hits.length; i += 2) iv.push([hits[i], hits[i + 1]]);
    if (iv.length) solid.set(k, iv);
  }
  solidOf[id] = { ax, u, w, solid, box: box.clone().expandByScalar(0.01) };
}
/** how deep a point (the item's own space) is inside the item, 0 outside */
const depthInItem = (id, p) => {
  const S0 = solidOf[id];
  if (!S0.box.containsPoint(p)) return 0;
  const iv = S0.solid.get(`${Math.floor(p.getComponent(S0.u) / GRID)},${Math.floor(p.getComponent(S0.w) / GRID)}`);
  if (!iv) return 0;
  const z = p.getComponent(S0.ax);
  for (const r of iv) if (z > r[0] && z < r[1]) return Math.min(z - r[0], r[1] - z);
  return 0;
};

const LOOPS = new Set([...Object.values(S.READY_LOOPS), ...Object.values(S.CALM_LOOPS)].flatMap((row) => Object.values(row).flat().flatMap((n) => (n.includes("{k}") ? S.MELEE_KEYS.map((k) => n.replace("{k}", k)) : [n]))).concat([S.CRAWL, "ual2-idle-foldarms-loop"]));
const WORN = [...LOOPS].filter((n) => !KIT.packOff(n) && !/zombie/.test(n));
const fails = [], notes = [];
for (const body of SURVIVORS) {
  const g = await loadBody(path.join(STAGE, "game", `${body}.glb`), (n) => WORN.includes(n));
  const scene = g.scene, mixer = new THREE.AnimationMixer(scene), bone = (n) => boneLike(scene, n);
  const clips = g.animations;
  const verts = [];
  scene.traverse((m) => {
    if (!m.isSkinnedMesh || /body_proxy/.test(m.name)) return;
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      let best = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; best = si.getComponent(i, j); } }
      const bn = m.skeleton.bones[best]?.name ?? "";
      verts.push({ m, i, arm: /arm|hand|clavicle|shoulder|finger|thumb|index|middle|ring|pinky/i.test(bn) });
    }
  });
  // ---- the body's measures, standing ----
  { mixer.stopAllAction(); const a = mixer.clipAction(clips.find((c) => c.name === "ual1-idle-loop")); a.reset().play(); a.time = 0; mixer.update(0); scene.updateMatrixWorld(true); a.stop(); }
  const v = new THREE.Vector3();
  const inFrame = (F, q) => { const d = [q.x - F.o[0], q.y - F.o[1], q.z - F.o[2]]; const dt = (a) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2]; return [dt(F.right), dt(F.up), dt(F.fwd)]; };
  const tr = KIT.stowFrame(bone, "thigh_r"), tl = KIT.stowFrame(bone, "thigh_l"), ch = KIT.stowFrame(bone, "chest");
  const m = { thighR: 0, thighL: 0, back: 0, seat: 0, pack: {} };
  const hp = KIT.stowFrame(bone, "hip");
  for (const q of verts) {
    if (q.arm) continue;
    q.m.getVertexPosition(q.i, v); v.applyMatrix4(q.m.matrixWorld);
    const r = inFrame(tr, v), l = inFrame(tl, v), c = inFrame(ch, v);
    // (the thigh's outer reach along the holster's run, the hip and seat above it included)
    if (r[1] < 0.05 && r[1] > -0.3 && Math.abs(r[2]) < 0.1) m.thighR = Math.max(m.thighR, r[0]);
    if (l[1] < 0.05 && l[1] > -0.3 && Math.abs(l[2]) < 0.1) m.thighL = Math.max(m.thighL, -l[0]);
    if (c[1] < 0.15 && c[1] > -0.45 && Math.abs(c[0]) < 0.18) m.back = Math.max(m.back, -c[2]);
    // the seat: how far back the belt line and the top of the seat reach, either side of the spine
    const h = inFrame(hp, v);
    if (h[1] < 0.12 && h[1] > -0.2 && Math.abs(h[0]) > 0.04 && Math.abs(h[0]) < 0.16) m.seat = Math.max(m.seat, -h[2]);
  }
  for (const pack of ["backpack-small", "backpack-large"]) {
    const pf = fit.packs[body]?.[pack];
    if (!pf) continue;
    const b = pack === "backpack-small" ? { half: 0.197, h: 0.441, zMid: 0.0 } : { half: 0.253, h: 1.078, zMid: 0.08 };
    m.pack[pack] = { half: b.half * pf.scale, mid: pf.up + (b.h * pf.scale) / 2, depth: pf.back + b.zMid * pf.scale };
  }
  console.log(`${body}: the seat ${(m.seat * 100).toFixed(1)} cm behind the hips, the back ${(m.back * 100).toFixed(1)} cm behind the chest`);
  // ---- place and measure ----
  const line = LINE + (SUIT[body] ?? 0);
  const M = new THREE.Matrix4(), inv = new THREE.Matrix4();
  fit.stow[body] ??= {};
  for (const [slot, p] of Object.entries(PLAN)) {
    const pk = slot.split(":")[0];
    if (pk.startsWith("backpack") && !m.pack[pk]) continue;
    if (SLOTS && !slot.includes(SLOTS)) continue;
    // OUT UNTIL IT CLEARS (Nov 12 2026): the plan sits an item a set distance off the body measured STANDING. On a
    // body in a thick vest (a creator-made soldier) the slung rifle sat 43 vertices deep in the back through a grab’s
    // braced squat. A slot past the law’s 15 is moved a centimetre further off (the frame’s back is −z) and measured
    // again (2 cm at a time, 16 cm at most) — and if it still doesn’t clear, the same again 4, 8 and 12 cm lower (a helmet or a
    // high collar is what a slung muzzle meets); one that clears as planned is left exactly where the plan put it.
    const at0 = p.at(m);
    let worst = { d: 0, clip: "", arm: 0, armClip: "" }, moved = 0, lower = 0, best = { d: Infinity, s: null, worst: null, moved: 0, lower: 0 };
    const tries = [0, 4, 8, 12].flatMap((dn) => Array.from({ length: 9 }, (_, o) => [o * 2, dn]));
    for (const [o, dn] of tries) {
    moved = o; lower = dn;
    const s = { frame: p.frame, at: [at0[0], at0[1] - dn * 0.01, at0[2] - o * 0.01].map((c) => +c.toFixed(3)), ...axesOf(p), pivot: p.pivot };
    fit.stow[body][slot] = s;
    KIT.setKitFit(fit);
    worst = { d: 0, clip: "", arm: 0, armClip: "" };
    for (const c of clips) {
      if (pk.startsWith("backpack") && !c) continue;
      mixer.stopAllAction(); const a = mixer.clipAction(c); a.reset().play();
      for (let f = 0; f < 8; f++) {
        a.time = c.duration * (f + 0.5) / 8; mixer.update(0); scene.updateMatrixWorld(true);
        if (!KIT.stowMatrix(body, slot, bone, M)) continue;
        inv.copy(M).invert();
        // (how many of the body's vertices the item passes through this moment: the law's own count — a
        // clip is past it when more than 15 sink in)
        let nb = 0, na = 0;
        for (const q of verts) {
          q.m.getVertexPosition(q.i, v); v.applyMatrix4(q.m.matrixWorld).applyMatrix4(inv);
          if (!depthInItem(p.id, v)) continue;
          if (q.arm) na++; else nb++;
        }
        if (nb > worst.d) worst = { ...worst, d: nb, clip: c.name };
        if (na > worst.arm) worst = { ...worst, arm: na, armClip: c.name };
      }
      a.stop();
    }
    if (worst.d < best.d) best = { d: worst.d, s, worst, moved, lower };
    if (worst.d <= 15) break;
    }
    // (nothing cleared: the least bad of them, said as a failure below)
    if (worst.d > 15 && best.s) { fit.stow[body][slot] = best.s; KIT.setKitFit(fit); worst = best.worst; moved = best.moved; lower = best.lower; }
    const msg = `${slot.padEnd(28)} body ${worst.d} verts${worst.clip ? ` (${worst.clip})` : ""} · arm ${worst.arm} verts${worst.armClip ? ` (${worst.armClip})` : ""}${(moved || lower) && worst.d <= 15 ? ` · moved ${moved} cm further off${lower ? ` and ${lower} cm lower` : ""} to clear` : ""}`;
    console.log("  " + msg);
    if (worst.d > 15) fails.push(`${body} ${msg}`);
    else if (worst.arm > 15) notes.push(`${body} ${msg}`);
  }
}
for (const n of notes) console.log("  note:", n);
for (const f of fails) console.log("  FAIL:", f);
if (WRITE) { fs.writeFileSync(FIT_FILE, JSON.stringify(fit, null, 1)); console.log("wrote", path.relative(ROOT, FIT_FILE)); }
if (OUT) {
  const mine = { packs: {}, stow: {} };
  for (const b of only) { if (fit.packs[b]) mine.packs[b] = fit.packs[b]; if (fit.stow[b]) mine.stow[b] = fit.stow[b]; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(mine, null, 1) + "\n");
  console.log("wrote", OUT);
  // (a slot that never cleared is printed as a FAIL above and kept at its least bad; a body with no stow fit
  // at all is the failure)
  if (only.some((b) => !Object.keys(mine.stow[b] ?? {}).length)) process.exit(1);
}
