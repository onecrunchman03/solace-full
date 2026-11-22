// SIMPLIFY A GLB's geometry (the counterpart to shrink-glb.mjs, which only
// touches textures). meshoptimizer's simplifier via gltf-transform — plain
// geometry out, so the client's stock GLTFLoader needs no decoder, same rule
// as ever (no draco, no meshopt encoding, no extensions beyond webp).
//
// Born for the escape room kit (Aug 2026): the bedside table was 165k tris —
// more than every casino table model combined — and shrink-glb took it from
// 18.1MB only to 17.7MB because the weight was all geometry.
//
//   node scripts/simplify-glb.mjs <in.glb> <out.glb> [ratio=0.1] [error=0.001] [--snap[=tol]]
//
// ratio is the TARGET fraction of triangles kept; error is the max relative
// deviation (raise it if the ratio isn't reached — the simplifier stops at
// whichever bound it hits first).
//
// --snap: position-snap weld for TRIANGLE SOUP. The bedside table arrived as
// 489k verts for 165k tris — three unique verts per face — so the exact weld
// merged nothing and the simplifier had no connectivity to collapse (165k ->
// 161k at ANY error bound). Snapping merges verts by quantized POSITION alone
// (first-seen vert donates its normal/uv; hard seams soften — fine for room
// furniture, check hero props in glbview.html). Default tol 1e-4 m.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify, prune, dedup } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { statSync } from "node:fs";

const args = process.argv.slice(2);
const snapArg = args.find((a) => a.startsWith("--snap"));
const pos = args.filter((a) => !a.startsWith("--"));
const [inFile, outFile, ratioArg, errArg] = pos;
if (!inFile || !outFile) {
  console.error("usage: node scripts/simplify-glb.mjs <in.glb> <out.glb> [ratio=0.1] [error=0.001] [--snap[=tol]]");
  process.exit(1);
}
const ratio = Number(ratioArg ?? 0.1);
const error = Number(errArg ?? 0.001);
const snapTol = snapArg ? Number(snapArg.split("=")[1] ?? 1e-4) : null;

/** Merge vertices by quantized position, keeping the first-seen vertex's full
 *  attribute set. Returns the primitive re-indexed over the compacted verts. */
function snapWeld(doc, prim, tol) {
  if (prim.getMode() !== 4) return;
  const posAcc = prim.getAttribute("POSITION");
  const p = posAcc.getArray();
  const n = posAcc.getCount();
  const key2new = new Map();
  const old2new = new Uint32Array(n);
  const keep = [];
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(p[i * 3] / tol)},${Math.round(p[i * 3 + 1] / tol)},${Math.round(p[i * 3 + 2] / tol)}`;
    let ni = key2new.get(k);
    if (ni === undefined) {
      ni = keep.length;
      key2new.set(k, ni);
      keep.push(i);
    }
    old2new[i] = ni;
  }
  if (keep.length === n) return; // nothing merged
  const oldIdx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: n }, (_, i) => i);
  const newIdx = new Uint32Array(oldIdx.length);
  for (let i = 0; i < oldIdx.length; i++) newIdx[i] = old2new[oldIdx[i]];
  const idxAcc = doc.createAccessor().setType("SCALAR").setArray(newIdx);
  prim.setIndices(idxAcc);
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem);
    const el = acc.getElementSize();
    const src = acc.getArray();
    const dst = new src.constructor(keep.length * el);
    for (let i = 0; i < keep.length; i++)
      for (let c = 0; c < el; c++) dst[i * el + c] = src[keep[i] * el + c];
    prim.setAttribute(sem, doc.createAccessor().setType(acc.getType()).setArray(dst));
  }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inFile);

const tris = (d) =>
  d.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);

const before = tris(doc);
if (snapTol !== null) {
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) snapWeld(doc, p, snapTol);
}
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error }),
  prune(),
);
const after = tris(doc);
await io.write(outFile, doc);

console.log(
  `${inFile.split(/[\\/]/).pop()}: ${Math.round(before).toLocaleString()} -> ${Math.round(after).toLocaleString()} tris, ` +
    `${(statSync(inFile).size / 1e6).toFixed(1)}MB -> ${(statSync(outFile).size / 1e6).toFixed(1)}MB`,
);
