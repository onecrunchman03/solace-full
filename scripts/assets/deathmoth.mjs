// THE DEATHMOTH, as a game asset (Level 5, the Terror Hotel). Not a kit prop:
// the game instances it into swarms (~24 a swarm) and flaps its wings in code,
// so this rebuilds Fog's "Death moths [BACKROOMS]" (Sketchfab, CC-BY-4.0) into
// the shape the code wants:
//
//   node scripts/assets/deathmoth.mjs
//   → client/public/assets/hotel/deathmoth.glb   (textures via shrink-glb)
//
// THE SHAPE (the code relies on every line of this):
//   · flying pose: head toward +z, back (dorsal) up +y, wings out along ±x
//   · origin on the body's centre line where the wings join
//   · WINGSPAN 1.0m tip to tip (scale it in code)
//   · three nodes, no animation:
//       "body"   everything that isn't a wing, one mesh (by material)
//       "wingL"  the moth's LEFT wings (fore + hind), all on +x
//       "wingR"  its RIGHT wings, all on −x
//     both wing nodes sit at the origin, so a flap is a rotation about the
//     node's own z (the body axis): +θ on wingL and −θ on wingR lift both.
//   · under ~4k triangles (the download's body was 10.8k), wings double-sided
//
// The download is read from assets/downloads/ (where intake.mjs files it) or,
// before that, from assets/New Assets/.

import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, join, weldPrimitive, simplifyPrimitive, transformPrimitive, compactPrimitive } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const UID = "b94c382e1f494cfbb925575392c70ea6";
const SRC = [path.join(ROOT, "assets", "downloads", "sketchfab", UID, "model.glb"), path.join(ROOT, "assets", "New Assets", "sketchfab", UID, "model.glb")].find(existsSync);
if (!SRC) throw new Error("the Deathmoth download isn't in assets/downloads or assets/New Assets");
const OUT = path.join(ROOT, "client", "public", "assets", "hotel", "deathmoth.glb");
const BODY_TRIS = 3200;
const WINGSPAN = 1.0;
const WING_NODE = /^Plane(\.\d+)?_\d+$/; // the four wing planes: Plane_12, Plane.001_13 …

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
for (const a of root.listAnimations()) a.dispose();

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
// the download stands the moth up (head +y, back +z, wings along x):
// tip it forward 90° about x (head → −z, back → +y), then turn it 180° about y
// (head → +z). Both proper rotations, so no handedness flip.
const rx = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]; // about x by −90°: y' = z, z' = −y
const ry = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]; // about y by 180°
const turn = mul(ry, rx);

// bake every mesh to world space (and turned), sorted into body / wing
const body = doc.createMesh("body");
const wings = [];
scene.traverse((n) => {
  const m = n.getMesh();
  if (!m) return;
  let isWing = false;
  for (let p = n; p; p = p.getParentNode()) if (WING_NODE.test(p.getName())) isWing = true;
  const M = mul(turn, n.getWorldMatrix());
  for (const prim of m.listPrimitives()) {
    const q = prim.clone();
    for (const s of q.listSemantics()) q.setAttribute(s, q.getAttribute(s).clone());
    if (q.getIndices()) q.setIndices(q.getIndices().clone());
    transformPrimitive(q, M);
    compactPrimitive(q);
    if (isWing) wings.push(q);
    else body.addPrimitive(q);
  }
});

// the hinge: the body's centre line, at the height and length where the wings
// meet it (the wing roots' inner corners)
const bb = (prims) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const v = [0, 0, 0];
  for (const p of prims) {
    const a = p.getAttribute("POSITION");
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], v[k]);
        max[k] = Math.max(max[k], v[k]);
      }
    }
  }
  return { min, max };
};
const bodyBox = bb(body.listPrimitives());
const all = bb([...body.listPrimitives(), ...wings]);
const cx = (bodyBox.min[0] + bodyBox.max[0]) / 2;
const centreX = (p) => {
  const b = bb([p]);
  return (b.min[0] + b.max[0]) / 2;
};
const side = (p) => (centreX(p) > cx ? "L" : "R"); // head +z, back +y: the moth's left is +x
const innerZ = wings.map((p) => {
  // where each wing reaches the body: its vertices nearest the centre line
  const a = p.getAttribute("POSITION");
  const v = [0, 0, 0];
  let best = Infinity;
  let z = 0;
  for (let i = 0; i < a.getCount(); i++) {
    a.getElement(i, v);
    const d = Math.abs(v[0] - cx);
    if (d < best) {
      best = d;
      z = v[2];
    }
  }
  return z;
});
const hingeZ = innerZ.reduce((s, z) => s + z, 0) / innerZ.length;
const hingeY = bb(wings).max[1] - (bb(wings).max[1] - bb(wings).min[1]) / 2;
const span = all.max[0] - all.min[0];
const k = WINGSPAN / span;
const recentre = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -cx * k, -hingeY * k, -hingeZ * k, 1];
for (const p of [...body.listPrimitives(), ...wings]) transformPrimitive(p, recentre);

// THE WINGS FACE UP. Two of the four are mirrored copies (a negative scale
// in the download); baked flat, their winding and normals disagreed and they
// lit black from above. Each wing is a flat sheet: its triangles are wound to
// face +y and its normals set straight up (the node's rotation carries them
// through a flap; the material is double-sided for the underside).
for (const p of wings) {
  const pos = p.getAttribute('POSITION');
  const idx = p.getIndices();
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  const arr = idx.getArray().slice();
  for (let t = 0; t < arr.length; t += 3) {
    pos.getElement(arr[t], a); pos.getElement(arr[t + 1], b); pos.getElement(arr[t + 2], c);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny < 0) { const q = arr[t + 1]; arr[t + 1] = arr[t + 2]; arr[t + 2] = q; }
  }
  idx.setArray(arr);
  const n = p.getAttribute('NORMAL');
  if (n) for (let i = 0; i < n.getCount(); i++) n.setElement(i, [0, 1, 0]);
}

// the old scene goes
for (const c of scene.listChildren()) {
  c.traverse((q) => q !== c && q.dispose());
  c.dispose();
}
const wingMesh = { L: doc.createMesh("wingL"), R: doc.createMesh("wingR") };
for (const p of wings) wingMesh[side(p)].addPrimitive(p);
const moth = doc.createNode("deathmoth");
moth.addChild(doc.createNode("body").setMesh(body));
moth.addChild(doc.createNode("wingL").setMesh(wingMesh.L));
moth.addChild(doc.createNode("wingR").setMesh(wingMesh.R));
scene.addChild(moth);

// thin the BODY piece by piece (eyes, legs, antennae — thinned as one, the
// small pieces vanish), then one draw call per material per node
const tris = (m) => m.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
const before = tris(body);
if (before > BODY_TRIS) for (const p of body.listPrimitives()) { weldPrimitive(p); simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: BODY_TRIS / before, error: 0.05 }); }
await doc.transform(join({ keepMeshes: true, keepNamed: true }), prune({ keepLeaves: true }), dedup());

for (const m of root.listMaterials()) m.setMetallicFactor(0);
// the wings are single planes: seen from below as well as above
for (const p of [...wingMesh.L.listPrimitives(), ...wingMesh.R.listPrimitives()]) p.getMaterial()?.setDoubleSided(true);

mkdirSync(path.dirname(OUT), { recursive: true });
const tmp = path.join(tmpdir(), `deathmoth-${process.pid}.glb`);
await io.write(tmp, doc);
execFileSync(process.execPath, [path.join(ROOT, "scripts", "shrink-glb.mjs"), tmp, OUT, "512"], { stdio: "inherit" });
rmSync(tmp);

const out = await io.read(OUT);
const b = getBounds(out.getRoot().listScenes()[0]);
console.log(`deathmoth.glb  ${b.min.map((v, i) => +(b.max[i] - v).toFixed(3)).join("×")}m  min [${b.min.map((v) => +v.toFixed(3))}]`);
for (const n of out.getRoot().listNodes()) {
  const m = n.getMesh();
  if (m) console.log(`  ${n.getName()}: ${tris(m)} tris, ${m.listPrimitives().length} draw call(s)  [${m.listPrimitives().map((p) => p.getMaterial()?.getName()).join(", ")}]`);
}
