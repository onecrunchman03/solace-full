// INSPECT A MODEL before it joins the prop kit — what it is, how it's built,
// what's wrong with it. The first step of the new-asset intake (Josh, Sep
// 2026: "check the assets and get a good understanding and fix any model
// issues").
//
//   node scripts/props/inspect.mjs "assets/New Assets/some.glb" [--depth=3]
//
// Prints: the scene's node tree to --depth with each node's world bounds (in
// the file's own units), triangle counts, the materials and their textures
// (with pixel sizes), any animation clips (and the nodes they drive), and the
// whole scene's size. Measure first; tune after.

import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import path from "node:path";

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/props/inspect.mjs "<file.glb>" [--depth=3]');
  process.exit(1);
}
const depth = Number(process.argv.find((a) => a.startsWith("--depth="))?.slice(8) ?? 3);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];

const tris = (node) => {
  let t = 0;
  node.traverse((n) => {
    const m = n.getMesh();
    if (!m) return;
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      const pos = p.getAttribute("POSITION");
      t += Math.round((idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3);
    }
  });
  return t;
};
const size = (node) => {
  try {
    const b = getBounds(node);
    return b.min.map((v, i) => +(b.max[i] - v).toFixed(3));
  } catch {
    return null;
  }
};

console.log(`${path.basename(file)}`);
// who made it and under what licence (Sketchfab writes it into asset.extras)
const ex = root.getAsset().extras ?? {};
if (ex.author || ex.license || ex.title) console.log(`  credit: ${ex.title ?? "?"} by ${ex.author ?? "?"} — ${ex.license ?? "?"}  ${ex.source ?? ""}`);
const sb = getBounds(scene);
console.log(`  scene size (x,y,z): ${sb.min.map((v, i) => +(sb.max[i] - v).toFixed(3)).join(" × ")}  min y ${sb.min[1].toFixed(3)}`);
console.log(`  triangles: ${tris(scene)}  meshes: ${root.listMeshes().length}  nodes: ${root.listNodes().length}`);
console.log("  tree:");
const walk = (n, d) => {
  if (d > depth) return;
  const kids = n.listChildren();
  const s = size(n);
  console.log(`  ${"  ".repeat(d)}- ${n.getName() || "(unnamed)"}${n.getMesh() ? " [mesh]" : ""}  ${s ? s.join("×") : ""}  tris ${tris(n)}${kids.length ? `  (${kids.length} children)` : ""}`);
  for (const k of kids) walk(k, d + 1);
};
for (const n of scene.listChildren()) walk(n, 1);
console.log("  materials:");
for (const m of root.listMaterials()) {
  const tex = [];
  for (const [slot, t] of [["base", m.getBaseColorTexture()], ["normal", m.getNormalTexture()], ["orm", m.getMetallicRoughnessTexture()], ["emit", m.getEmissiveTexture()]]) {
    if (!t) continue;
    let px = "?";
    try {
      const meta = await sharp(Buffer.from(t.getImage())).metadata();
      px = `${meta.width}x${meta.height}`;
    } catch {
      /* unreadable */
    }
    tex.push(`${slot} ${px}`);
  }
  console.log(`    ${m.getName() || "(unnamed)"}  alpha ${m.getAlphaMode()}  ${tex.join(", ") || "no textures"}  color ${m.getBaseColorFactor().map((v) => v.toFixed(2)).join(",")}`);
}
const anims = root.listAnimations();
console.log(`  animations: ${anims.length}`);
for (const a of anims) {
  const targets = new Set(a.listChannels().map((c) => `${c.getTargetNode()?.getName()}.${c.getTargetPath()}`));
  let dur = 0;
  for (const s of a.listSamplers()) {
    const inp = s.getInput();
    if (inp) dur = Math.max(dur, inp.getMax([])[0]);
  }
  console.log(`    ${a.getName() || "(unnamed)"}  ${dur.toFixed(2)}s  drives: ${[...targets].slice(0, 8).join(" ")}${targets.size > 8 ? " …" : ""}`);
}
