// THE LABS AIRLOCK'S BUMP RAIL, cut out of the doorway in the PACKED shell (labs.glb) without a rebake.
// The rail is 10 triangles of SHELL_labs's "steel" primitive: three long faces (front, top, bottom) running
// 60.25 → 107.75 and an end cap at each end. The long faces are clipped at the doorway's two cut planes
// (every attribute — position, normal, both UV sets — interpolated linearly in its own stored space, so the
// baked lightmap still lands where it did), the middle is dropped, and each cut end is closed with a cap
// that copies the matching original end cap's normal and UVs. Nothing else in the file is touched.
// A STOPGAP until labs is rebaked: scripts/survivorz/layout-labs.mjs already breaks the rail at the doorway,
// so the next room-build.py --set labs makes this unnecessary (it couldn't run on Oct 29 2026: the live AI
// model held the GPU and all but ~2 GB of the machine's commit).
//   node scripts/survivorz/room-railcut.mjs assets/downloads/survivorz/rooms/labs/labs.glb.pre-railcut assets/downloads/survivorz/rooms/labs/labs.glb
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");

const [IN, OUT] = [process.argv[2], process.argv[3]];
const X0 = Number(process.argv[4] ?? 104.25), X1 = Number(process.argv[5] ?? 105.75);
const BOX = { y0: 0.915, y1: 1.045, z0: 45.825, z1: 45.885, x0: 60.2, x1: 107.8 };

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(IN);
const root = doc.getRoot();

// the SHELL node and its world matrix (positions may be quantized under a node transform)
const node = root.listNodes().find((n) => n.getMesh() && /^SHELL/.test(n.getMesh().getName()));
if (!node) throw new Error("no SHELL mesh");
const M = node.getWorldMatrix();
const prims = node.getMesh().listPrimitives().filter((p) => p.getMaterial()?.getName() === "steel");
const inRail = (p) => { const A = p.getAttribute("POSITION"), I = p.getIndices().getArray(); let n = 0; for (let t = 0; t < I.length; t += 3) { let ok = true; for (let v = 0; v < 3; v++) { const a = A.getElement(I[t + v], []); const w = [M[0] * a[0] + M[4] * a[1] + M[8] * a[2] + M[12], M[1] * a[0] + M[5] * a[1] + M[9] * a[2] + M[13], M[2] * a[0] + M[6] * a[1] + M[10] * a[2] + M[14]]; if (!(w[0] > 60.2 && w[0] < 107.8 && w[1] > 0.915 && w[1] < 1.045 && w[2] > 45.825 && w[2] < 45.885)) ok = false; } if (ok) n++; } return n; };
const prim = prims.find((p) => inRail(p) === 10);
if (!prim) throw new Error("no steel primitive holding the rail (" + prims.map(inRail).join(",") + ")");
const attrs = prim.listSemantics().map((s) => [s, prim.getAttribute(s)]);
const P = prim.getAttribute("POSITION");
const unnorm = (acc) => {
  if (!acc.getNormalized()) return 1;
  const t = acc.getComponentType();
  return t === 5120 ? 1 / 127 : t === 5121 ? 1 / 255 : t === 5122 ? 1 / 32767 : t === 5123 ? 1 / 65535 : 1;
};
const ps = 1;   // getElement hands back decoded (denormalized) values; setElement encodes
const world = (i) => {
  const a = P.getElement(i, []).map((v) => v * ps);
  return [M[0] * a[0] + M[4] * a[1] + M[8] * a[2] + M[12], M[1] * a[0] + M[5] * a[1] + M[9] * a[2] + M[13], M[2] * a[0] + M[6] * a[1] + M[10] * a[2] + M[14]];
};
const idxAcc = prim.getIndices();
const idx = Array.from(idxAcc.getArray());
const inBox = (w) => w[0] > BOX.x0 && w[0] < BOX.x1 && w[1] > BOX.y0 && w[1] < BOX.y1 && w[2] > BOX.z0 && w[2] < BOX.z1;
const rail = [];
for (let t = 0; t < idx.length; t += 3) if ([0, 1, 2].every((v) => inBox(world(idx[t + v])))) rail.push(t);
console.log(`rail triangles: ${rail.length}`);
if (rail.length !== 10) throw new Error("expected 10 rail triangles");
const xs = (t) => [0, 1, 2].map((v) => world(idx[t + v])[0]);
const longT = rail.filter((t) => Math.max(...xs(t)) - Math.min(...xs(t)) > 40);
const capW = rail.filter((t) => Math.max(...xs(t)) < 61), capE = rail.filter((t) => Math.min(...xs(t)) > 107);
console.log(`long ${longT.length}, west cap ${capW.length}, east cap ${capE.length}`);
if (longT.length !== 6 || capW.length !== 2 || capE.length !== 2) throw new Error("unexpected rail layout");

// vertex data in stored (raw) space, per attribute
const raw = (i) => attrs.map(([, a]) => a.getElement(i, []));
const isInt = attrs.map(() => false);
const lerpV = (va, vb, f) => va.map((arr, k) => arr.map((x, j) => { const v = x + (vb[k][j] - x) * f; return isInt[k] ? Math.round(v) : v; }));
const newVerts = [];   // raw vertex records
const addVert = (rec) => { newVerts.push(rec); return P.getCount() + newVerts.length - 1; };
const wx = (rec) => { const a = rec[attrs.findIndex(([s]) => s === "POSITION")].map((v) => v * ps); return M[0] * a[0] + M[4] * a[1] + M[8] * a[2] + M[12]; };

// Sutherland–Hodgman on x: keep the side `keep(x)`; the plane at X
function clip(poly, X, keepLess) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const xa = wx(a), xb = wx(b);
    const ina = keepLess ? xa <= X : xa >= X, inb = keepLess ? xb <= X : xb >= X;
    if (ina) out.push(a);
    if (ina !== inb) out.push(lerpV(a, b, (X - xa) / (xb - xa)));
  }
  return out;
}
const newTris = [];
const cutCorners = { [X0]: [], [X1]: [] };
for (const t of longT) {
  const tri = [0, 1, 2].map((v) => raw(idx[t + v]));
  for (const [X, less] of [[X0, true], [X1, false]]) {
    const poly = clip(tri, X, less);
    if (poly.length < 3) continue;
    const ids = poly.map((rec) => addVert(rec));
    for (let k = 1; k + 1 < poly.length; k++) newTris.push(ids[0], ids[k], ids[k + 1]);
    for (const rec of poly) if (Math.abs(wx(rec) - X) < 1e-3) cutCorners[X].push(rec);
  }
}
// the caps: the cut end at X0 faces +x (copy the east cap), the one at X1 faces −x (copy the west cap)
const posK = attrs.findIndex(([s]) => s === "POSITION");
const yzKey = (rec) => { const i = rec; const a = i[posK].map((v) => v * ps); const y = M[1] * a[0] + M[5] * a[1] + M[9] * a[2] + M[13], z = M[2] * a[0] + M[6] * a[1] + M[10] * a[2] + M[14]; return `${y > 0.98 ? "T" : "B"}${z > 45.855 ? "K" : "F"}`; };
for (const [X, capTris] of [[X0, capE], [X1, capW]]) {
  const corner = new Map();
  for (const rec of cutCorners[X]) if (!corner.has(yzKey(rec))) corner.set(yzKey(rec), rec);
  for (const t of capTris) {
    const ids = [0, 1, 2].map((v) => {
      const src = raw(idx[t + v]);
      const at = corner.get(yzKey(src));
      if (!at) throw new Error(`no cut corner ${yzKey(src)} at ${X} (have ${[...corner.keys()]})`);
      const rec = src.map((arr) => arr.slice());
      rec[posK] = at[posK].slice();
      return addVert(rec);
    });
    newTris.push(...ids);
  }
}
// rewrite: the 10 old rail triangles out, the new ones in
const drop = new Set(rail.flatMap((t) => [t, t + 1, t + 2]));
const keep = idx.filter((_, i) => !drop.has(i));
const n0 = P.getCount();
for (const [k, [, a]] of attrs.entries()) {
  const size = a.getElementSize(), arr = a.getArray();
  const out = new arr.constructor((n0 + newVerts.length) * size);
  out.set(arr.subarray(0, n0 * size));
  a.setArray(out);
  newVerts.forEach((rec, i) => a.setElement(n0 + i, rec[k]));   // encoded into the stored type
}
const all = [...keep, ...newTris];
const maxI = Math.max(...all);
idxAcc.setArray(maxI > 65535 ? Uint32Array.from(all) : (idxAcc.getArray().constructor === Uint32Array ? Uint32Array.from(all) : Uint16Array.from(all)));
console.log(`steel primitive: ${n0} → ${n0 + newVerts.length} vertices, ${idx.length / 3} → ${all.length / 3} triangles (rail ${rail.length} → ${newTris.length / 3})`);
// check: no rail triangle reaches into the doorway any more
let bad = 0;
const wOf = (i) => { if (i < n0) return world(i); const rec = newVerts[i - n0]; const a = rec[posK].map((v) => v * ps); return [M[0] * a[0] + M[4] * a[1] + M[8] * a[2] + M[12], M[1] * a[0] + M[5] * a[1] + M[9] * a[2] + M[13], M[2] * a[0] + M[6] * a[1] + M[10] * a[2] + M[14]]; };
for (let t = 0; t < all.length; t += 3) {
  const w3 = [0, 1, 2].map((v) => wOf(all[t + v]));
  if (!w3.every(inBox)) continue;
  const cx = (w3[0][0] + w3[1][0] + w3[2][0]) / 3;
  if (cx > X0 + 0.005 && cx < X1 - 0.005) bad++;
}
console.log(`rail triangles left in the doorway: ${bad}`);
if (bad) throw new Error("rail still in the doorway");
await io.write(OUT, doc);
console.log(`→ ${OUT}`);
