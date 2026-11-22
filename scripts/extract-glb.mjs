// EXTRACT ONE OBJECT from a merged scene GLB.
//
// Born for the escape room's "celling_lights_v.001.glb" (Aug 2026): not a
// fixture but an entire 52x50m ceiling RIG — 631k tris of many light fixtures
// merged into 8 material-grouped meshes. We want ONE fixture to instance.
//
// Method: snap-weld positions for connectivity, union-find connected
// components per primitive, then cluster components ACROSS primitives by
// bbox overlap (a fixture's glass and metal are separate materials that
// occupy the same space). --list prints the clusters; --pick=N rebuilds the
// GLB with only that cluster's triangles, recentered so its bbox sits on the
// origin (min-Y at 0 — props here stand on their base... except ceiling
// fixtures, which HANG: use --hang to put max-Y at 0 instead).
//
//   node scripts/extract-glb.mjs <in.glb> --list
//   node scripts/extract-glb.mjs <in.glb> <out.glb> --pick=N [--hang] [--up=y|z]
//
// --up: which RAW-VERTEX axis is vertical. The ceiling rig bakes Z-up verts
// under a -90deg-X rotation parent (exporter convention) — the parent stays in
// the output so it renders upright, but recentering must floor/ceil the raw
// Z, not Y. Default y.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const flag = (n) => args.find((a) => a.startsWith(`--${n}`));
const [inFile, outFile] = files;
if (!inFile || (!flag("list") && (!outFile || !flag("pick")))) {
  console.error("usage: node scripts/extract-glb.mjs <in.glb> (--list | <out.glb> --pick=N [--hang])");
  process.exit(1);
}
const TOL = 1e-4;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inFile);

// Gather every triangle-mode primitive with its world-ish positions (the kit's
// scenes bake transforms into the verts; node transforms here are identity —
// asserted so a future non-identity file fails loudly instead of extracting
// in the wrong space).
const prims = [];
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue;
    prims.push(prim);
  }
for (const node of doc.getRoot().listNodes()) {
  const t = node.getTranslation(), r = node.getRotation(), s = node.getScale();
  const identity =
    t.every((v) => Math.abs(v) < 1e-6) &&
    r[3] > 1 - 1e-6 &&
    s.every((v) => Math.abs(v - 1) < 1e-6);
  if (node.getMesh() && !identity)
    throw new Error(`node "${node.getName()}" has a non-identity transform — extraction assumes baked verts`);
}

// Union-find over snapped positions, GLOBAL across primitives, so a fixture
// split across materials is one component from the start.
const parent = [];
const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
const key2id = new Map();
const primVertIds = []; // per prim: Uint32Array vert -> global snapped id
for (const prim of prims) {
  const p = prim.getAttribute("POSITION").getArray();
  const n = prim.getAttribute("POSITION").getCount();
  const ids = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(p[i * 3] / TOL)},${Math.round(p[i * 3 + 1] / TOL)},${Math.round(p[i * 3 + 2] / TOL)}`;
    let id = key2id.get(k);
    if (id === undefined) { id = parent.length; parent.push(id); key2id.set(k, id); }
    ids[i] = id;
  }
  primVertIds.push(ids);
  const idx = prim.getIndices()?.getArray();
  const count = idx ? idx.length : n;
  const at = (j) => ids[idx ? idx[j] : j];
  for (let t = 0; t + 2 < count; t += 3) { union(at(t), at(t + 1)); union(at(t), at(t + 2)); }
}

// Component bboxes + tri counts.
const comps = new Map(); // root -> {min,max,tris}
for (const [pi, prim] of prims.entries()) {
  const p = prim.getAttribute("POSITION").getArray();
  const ids = primVertIds[pi];
  const idx = prim.getIndices()?.getArray();
  const count = idx ? idx.length : ids.length;
  for (let t = 0; t + 2 < count; t += 3) {
    const root = find(ids[idx ? idx[t] : t]);
    let c = comps.get(root);
    if (!c) comps.set(root, (c = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], tris: 0 }));
    c.tris++;
    for (let v = 0; v < 3; v++) {
      const vi = idx ? idx[t + v] : t + v;
      for (let a = 0; a < 3; a++) {
        c.min[a] = Math.min(c.min[a], p[vi * 3 + a]);
        c.max[a] = Math.max(c.max[a], p[vi * 3 + a]);
      }
    }
  }
}

// Cluster components whose bboxes overlap (padded 5cm) — glass + housing.
const list = [...comps.entries()].map(([root, c]) => ({ root, ...c, cluster: -1 }));
const PAD = 0.05;
const overlaps = (a, b) =>
  a.min.every((_, i) => a.min[i] - PAD <= b.max[i] && b.min[i] - PAD <= a.max[i]);
const clusters = [];
for (const c of list.sort((a, b) => b.tris - a.tris)) {
  let home = clusters.find((cl) => cl.members.some((m) => overlaps(m, c)));
  if (!home) clusters.push((home = { members: [], min: [...c.min], max: [...c.max], tris: 0 }));
  home.members.push(c);
  home.tris += c.tris;
  for (let a = 0; a < 3; a++) {
    home.min[a] = Math.min(home.min[a], c.min[a]);
    home.max[a] = Math.max(home.max[a], c.max[a]);
  }
}
clusters.sort((a, b) => b.tris - a.tris);

if (flag("list")) {
  for (const [i, cl] of clusters.entries()) {
    const d = cl.max.map((v, a) => v - cl.min[a]);
    console.log(
      `#${String(i).padStart(3)} tris ${String(cl.tris).padStart(8)}  parts ${String(cl.members.length).padStart(3)}  ` +
        `size ${d.map((v) => v.toFixed(2)).join(" x ")}  at ${cl.min.map((v) => v.toFixed(1)).join(",")}`,
    );
  }
  console.log(`\n${clusters.length} clusters, ${list.length} raw components`);
  process.exit(0);
}

const pick = clusters[Number(flag("pick").split("=")[1])];
if (!pick) throw new Error("no such cluster");
const roots = new Set(pick.members.map((m) => find(m.root)));
const UP = (flag("up")?.split("=")[1] ?? "y") === "z" ? 2 : 1;
const center = [0, 1, 2].map((a) =>
  a === UP ? (flag("hang") ? pick.max[a] : pick.min[a]) : (pick.min[a] + pick.max[a]) / 2,
);
const [cx, cy, cz] = center;

// Non-triangle prims (strips, fans, lines) never entered the connectivity
// pass, so without this they'd survive extraction WHOLE — the first run
// shipped a stray 50-tri strip from the far corner of the rig inside both
// fixtures, 26m from the origin.
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives())
    if (prim.getMode() !== 4) mesh.removePrimitive(prim);

for (const [pi, prim] of prims.entries()) {
  const ids = primVertIds[pi];
  const idx = prim.getIndices()?.getArray();
  const count = idx ? idx.length : ids.length;
  const keptTris = [];
  for (let t = 0; t + 2 < count; t += 3)
    if (roots.has(find(ids[idx ? idx[t] : t]))) keptTris.push(t);
  if (keptTris.length === 0) {
    for (const m of doc.getRoot().listMeshes()) if (m.listPrimitives().includes(prim)) m.removePrimitive(prim);
    continue;
  }
  // Compact: collect used verts, rebuild attributes + indices, recenter.
  const old2new = new Map();
  const order = [];
  const newIdx = new Uint32Array(keptTris.length * 3);
  let w = 0;
  for (const t of keptTris)
    for (let v = 0; v < 3; v++) {
      const vi = idx ? idx[t + v] : t + v;
      let ni = old2new.get(vi);
      if (ni === undefined) { ni = order.length; old2new.set(vi, ni); order.push(vi); }
      newIdx[w++] = ni;
    }
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem);
    const el = acc.getElementSize();
    const src = acc.getArray();
    const dst = new src.constructor(order.length * el);
    for (let i = 0; i < order.length; i++)
      for (let c = 0; c < el; c++) dst[i * el + c] = src[order[i] * el + c];
    if (sem === "POSITION")
      for (let i = 0; i < order.length; i++) {
        dst[i * 3] -= cx; dst[i * 3 + 1] -= cy; dst[i * 3 + 2] -= cz;
      }
    prim.setAttribute(sem, doc.createAccessor().setType(acc.getType()).setArray(dst));
  }
  prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(newIdx));
}
await doc.transform(prune());
await io.write(outFile, doc);
const d = pick.max.map((v, a) => v - pick.min[a]);
console.log(`extracted cluster: ${pick.tris.toLocaleString()} tris, ${d.map((v) => v.toFixed(2)).join(" x ")} m -> ${outFile}`);
