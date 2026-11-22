// Measure a GLB: node list, world-space bbox per node and overall, texture weight.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const file = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();

const mul = (m, v) => {
  const [x, y, z] = v;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
};

let lo = [Infinity, Infinity, Infinity];
let hi = [-Infinity, -Infinity, -Infinity];
let tris = 0;

function walk(node, parentMat) {
  const m = node.getWorldMatrix ? node.getWorldMatrix() : parentMat;
  const mesh = node.getMesh();
  if (mesh) {
    let nlo = [Infinity, Infinity, Infinity];
    let nhi = [-Infinity, -Infinity, -Infinity];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : pos.getCount()) / 3;
      const pmin = pos.getMin([]);
      const pmax = pos.getMax([]);
      // transform the 8 corners
      for (let c = 0; c < 8; c++) {
        const v = [c & 1 ? pmax[0] : pmin[0], c & 2 ? pmax[1] : pmin[1], c & 4 ? pmax[2] : pmin[2]];
        const w = mul(m, v);
        for (let i = 0; i < 3; i++) {
          nlo[i] = Math.min(nlo[i], w[i]);
          nhi[i] = Math.max(nhi[i], w[i]);
          lo[i] = Math.min(lo[i], w[i]);
          hi[i] = Math.max(hi[i], w[i]);
        }
      }
    }
    const f = (n) => n.toFixed(3).padStart(8);
    console.log(
      `  node ${(node.getName() || "(unnamed)").padEnd(28)} ` +
        `x ${f(nlo[0])}..${f(nhi[0])}  y ${f(nlo[1])}..${f(nhi[1])}  z ${f(nlo[2])}..${f(nhi[2])}`,
    );
  }
  for (const c of node.listChildren()) walk(c, m);
}

console.log(file);
for (const scene of root.listScenes()) for (const n of scene.listChildren()) walk(n);

const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
console.log(`\n  OVERALL  w(x) ${size[0].toFixed(3)}  h(y) ${size[1].toFixed(3)}  d(z) ${size[2].toFixed(3)}`);
console.log(`  min ${lo.map((n) => n.toFixed(3)).join(", ")}   max ${hi.map((n) => n.toFixed(3)).join(", ")}`);
console.log(`  tris ${Math.round(tris)}  meshes ${root.listMeshes().length}  materials ${root.listMaterials().length}`);
for (const t of root.listTextures()) {
  console.log(`  tex ${(t.getName() || "?").padEnd(20)} ${t.getMimeType()} ${(t.getImage()?.byteLength / 1024).toFixed(0)}KB`);
}
