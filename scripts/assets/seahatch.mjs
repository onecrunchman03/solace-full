// THE SEA HATCH, as a game asset (Level 6, Lights Out). Not a kit prop: the
// level has exactly one, the scene opens its leaf when the Handwheel is
// fitted, so this rebuilds Digital Goblin's "Naval Ship Door/Hatch"
// (Sketchfab, CC-BY-4.0) into the shape the code wants:
//
//   node scripts/assets/seahatch.mjs
//   → client/public/assets/lights/seahatch.glb
//
// THE DOWNLOAD holds TWO hatches side by side, one shut and one swung open,
// all in one mesh — and at 3.34m tall, nearly twice the size of a ship's
// watertight door. So: the loose parts are found (welded by position), only
// the SHUT copy (every part left of x = 0) is kept, and it is split into
//
// THE SHAPE (lights-scene.ts relies on every line of this):
//   · front +z (the side the leaf swings toward — the room), back on z = 0,
//     centred on x, standing on y = 0, HEIGHT 1.9m
//   · two nodes: "frame" (the coaming, its hinge knuckles and anything that
//     reaches past the leaf) and "leaf" (the door itself, both portholes, its
//     handles) — the leaf node's ORIGIN is its hinge line, at its min x, so
//     opening it is rotation.y = −θ
//   · untextured in the download (a normal map only): painted ship-steel
//     here, metallic 0 like every kit prop (no environment map to reflect)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, transformPrimitive, compactPrimitive } from "@gltf-transform/functions";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const UID = "514cf4b2872d484497425033eeec9c0a";
const SRC = [path.join(ROOT, "assets", "downloads", "sketchfab", UID, "model.glb"), path.join(ROOT, "assets", "New Assets", "sketchfab", UID, "model.glb")].find(existsSync);
if (!SRC) throw new Error("the sea hatch download isn't in assets/downloads or assets/New Assets");
const OUT = path.join(ROOT, "client", "public", "assets", "lights", "seahatch.glb");
const HEIGHT = 1.9;
const STEEL = [0.24, 0.27, 0.28, 1];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const node = root.listNodes().find((n) => n.getMesh());
const M = node.getWorldMatrix();
const prim0 = node.getMesh().listPrimitives()[0];
const pos = prim0.getAttribute("POSITION");
const idx = prim0.getIndices();
const n = pos.getCount();
const world = (i) => {
  const v = pos.getElement(i, [0, 0, 0]);
  return [0, 1, 2].map((j) => M[j] * v[0] + M[4 + j] * v[1] + M[8 + j] * v[2] + M[12 + j]);
};

// loose parts: weld by position, join through triangles
const par = Int32Array.from({ length: n }, (_, i) => i);
const find = (x) => {
  while (par[x] !== x) x = par[x] = par[par[x]];
  return x;
};
const at = new Map();
for (let i = 0; i < n; i++) {
  const k = pos.getElement(i, [0, 0, 0]).map((a) => a.toFixed(4)).join();
  if (at.has(k)) par[find(i)] = find(at.get(k));
  else at.set(k, i);
}
for (let t = 0; t < idx.getCount(); t += 3) {
  const [a, b, c] = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
  par[find(a)] = find(b);
  par[find(b)] = find(c);
}
const box = new Map();
for (let i = 0; i < n; i++) {
  const r = find(i);
  const w = world(i);
  let b = box.get(r);
  if (!b) box.set(r, (b = { min: [...w], max: [...w] }));
  for (let j = 0; j < 3; j++) {
    b.min[j] = Math.min(b.min[j], w[j]);
    b.max[j] = Math.max(b.max[j], w[j]);
  }
}
// the shut copy is everything left of x = 0; its leaf is the biggest part
// narrower than the coaming
const shut = [...box.entries()].filter(([, b]) => b.max[0] < 0);
const width = (b) => b.max[0] - b.min[0];
const coaming = Math.max(...shut.map(([, b]) => width(b)));
const leafBox = shut.filter(([, b]) => width(b) < coaming - 0.1).sort((p, q) => width(q[1]) * (q[1].max[1] - q[1].min[1]) - width(p[1]) * (p[1].max[1] - p[1].min[1]))[0][1];
const E = 0.03;
const inLeaf = (b) => b.min[0] >= leafBox.min[0] - E && b.max[0] <= leafBox.max[0] + E && b.min[1] >= leafBox.min[1] - E && b.max[1] <= leafBox.max[1] + E;
const group = new Map(shut.map(([r, b]) => [r, inLeaf(b) ? "leaf" : "frame"]));
console.log(`parts: ${box.size} · shut copy ${shut.length} (${[...group.values()].filter((g) => g === "leaf").length} leaf)`);

// the shut copy's box, for the normalising transform
const all = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
for (const [, b] of shut)
  for (let j = 0; j < 3; j++) {
    all.min[j] = Math.min(all.min[j], b.min[j]);
    all.max[j] = Math.max(all.max[j], b.max[j]);
  }
const s = HEIGHT / (all.max[1] - all.min[1]);
const cx = (all.min[0] + all.max[0]) / 2;
// the open copy swings toward −z, so the download's front is −z: turn 180°
// about y (x → −x, z → −z), then the back (old max z) lands on z = 0
const N = [
  -s, 0, 0, 0,
  0, s, 0, 0,
  0, 0, -s, 0,
  s * cx, -s * all.min[1], s * all.max[2], 1,
];
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const T = mul(N, M);

const mat = prim0.getMaterial();
mat.setBaseColorFactor(STEEL).setMetallicFactor(0).setRoughnessFactor(0.55);
const part = (want) => {
  const tris = [];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const a = idx.getScalar(t);
    if (group.get(find(a)) === want) tris.push(a, idx.getScalar(t + 1), idx.getScalar(t + 2));
  }
  const q = prim0.clone();
  for (const sem of q.listSemantics()) q.setAttribute(sem, q.getAttribute(sem).clone());
  q.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(tris)).setBuffer(idx.getBuffer()));
  transformPrimitive(q, T);
  compactPrimitive(q);
  return q;
};
const framePrim = part("frame");
const leafPrim = part("leaf");
// the leaf's hinge line: its min x (the download's hinge edge, mirrored by the
// turn), at its middle depth
const lp = leafPrim.getAttribute("POSITION");
let minX = 1e9, minZ = 1e9, maxZ = -1e9;
for (let i = 0; i < lp.getCount(); i++) {
  const v = lp.getElement(i, [0, 0, 0]);
  minX = Math.min(minX, v[0]);
  minZ = Math.min(minZ, v[2]);
  maxZ = Math.max(maxZ, v[2]);
}
const hinge = [minX, 0, (minZ + maxZ) / 2];
transformPrimitive(leafPrim, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -hinge[0], 0, -hinge[2], 1]);

for (const c of scene.listChildren()) c.dispose();
for (const m of root.listMeshes()) m.dispose();
const frame = doc.createNode("frame").setMesh(doc.createMesh("frame").addPrimitive(framePrim));
const leaf = doc.createNode("leaf").setMesh(doc.createMesh("leaf").addPrimitive(leafPrim)).setTranslation(hinge);
scene.addChild(frame).addChild(leaf);
await doc.transform(prune(), dedup());
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
console.log(`→ ${path.relative(ROOT, OUT)}  ${(all.max[0] - all.min[0]) * s}m wide × ${HEIGHT}m, hinge at x ${hinge[0].toFixed(3)} z ${hinge[2].toFixed(3)}`);
writeFileSync(
  path.join(path.dirname(OUT), "CREDITS-seahatch.txt"),
  `THE SEA HATCH — Lights Out's way on (Solace, Backrooms Level 6)

Model: "Naval Ship Door/Hatch"
by Digital Goblin, Sketchfab
https://sketchfab.com/3d-models/naval-ship-doorhatch-514cf4b2872d484497425033eeec9c0a
License: Creative Commons Attribution 4.0 (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/

Changed for Solace (scripts/assets/seahatch.mjs): only the shut copy of the two
in the download is kept, scaled to 1.9m, turned to face the room, split into a
frame and a hinged leaf, and painted ship-steel.
`,
);
