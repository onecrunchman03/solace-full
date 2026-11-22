// SURVIVORZ: lists a gun model's LOOSE PARTS (triangles joined by shared vertex positions) with
// their boxes, so a part can be picked out by where it is: the shotgun's sling (cut away — a
// stiff loop of strap hanging off the gun reads as a mistake) and its pump (split out so it can
// slide). scripts/survivorz/guns.mjs uses the same split.
//   node scripts/survivorz/gun-parts.mjs <glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

// boxes come back in WORLD units through the mesh's node matrix (an FBX often keeps the model at
// centimetre scale under a scaled node)
export function looseParts(prim, matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) {
  const raw = prim.getAttribute("POSITION").getArray(), idx = prim.getIndices().getArray();
  const m = matrix, pos = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = m[k] * raw[i] + m[4 + k] * raw[i + 1] + m[8 + k] * raw[i + 2] + m[12 + k];
  // weld by position (an FBX splits vertices at every UV seam, which would cut a part in pieces),
  // to a tenth of a millimetre
  const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  const id = new Map(), weld = new Int32Array(pos.length / 3);
  for (let i = 0; i < weld.length; i++) { const k = key(i); if (!id.has(k)) id.set(k, id.size); weld[i] = id.get(k); }
  const parent = new Int32Array(id.size).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(weld[idx[t]]), b = find(weld[idx[t + 1]]), c = find(weld[idx[t + 2]]); parent[b] = a; parent[find(c)] = a; }
  const parts = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(weld[idx[t]]);
    if (!parts.has(r)) parts.set(r, { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    const p = parts.get(r); p.tris.push(t / 3);
    for (const v of [idx[t], idx[t + 1], idx[t + 2]]) for (let k = 0; k < 3; k++) { p.min[k] = Math.min(p.min[k], pos[v * 3 + k]); p.max[k] = Math.max(p.max[k], pos[v * 3 + k]); }
  }
  return [...parts.values()].sort((a, b) => b.tris.length - a.tris.length);
}

if (process.argv[2]) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(process.argv[2]);
  for (const node of doc.getRoot().listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; for (const prim of mesh.listPrimitives()) {
    const parts = looseParts(prim, node.getWorldMatrix());
    console.log(`${mesh.getName()}: ${parts.length} loose parts`);
    for (const [i, p] of parts.entries()) console.log(`  ${String(i).padStart(3)} tris ${String(p.tris.length).padStart(5)}  min ${p.min.map((v) => v.toFixed(3)).join(",")}  max ${p.max.map((v) => v.toFixed(3)).join(",")}`);
  } }
}
