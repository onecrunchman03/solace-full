// VEGAS INTAKE — turns the untouched Sketchfab downloads into game-ready GLBs
// for the Classic Vegas casino floor, plus a measured manifest per model.
//   node scripts/casino/vegas-intake.mjs [id ...]   (sources: assets/downloads/sketchfab/<uid>/, see assets/casino/vegas-assets.md)
// For every recipe: keep the named top nodes, scale to a real-world size,
// stand it on y=0 centred in x/z, bake every transform into the vertices,
// merge primitives per material (fewer draw calls in a bank of 12), set
// metallic to 0 (the prop-kit rule), make every BLEND material single-sided
// (no two-pass transparency) or MASK where the "transparency" is a cut-out,
// then re-encode textures with scripts/shrink-glb.mjs.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const R = path.resolve(import.meta.dirname, "..", "..");
const req = createRequire(R + "/package.json");
const { NodeIO, getBounds } = req("@gltf-transform/core");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");
const { flatten, clearNodeTransform, join, prune, dedup, weld } = req("@gltf-transform/functions");
const OUT = R + "/client/public/assets/casino/vegas";
const MAN = R + "/assets/casino/manifests";
const TMP = path.join((await import("node:os")).tmpdir(), "vegas-intake");
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// height = target height in metres (or width = target x size); keep = top-level node names under the model root
const RECIPES = [
  { id: "slot-vegas-star", uid: "b853ed93538a4405949800ab501606d8", keep: /^slot_machine1$/, height: 1.75, mask: /^Mat_10$/, what: "upright 3-reel slot, 'Vegas Star' topper + paytable glass, chrome cabinet" },
  { id: "slot-bulb-classic", uid: "49fc3271878e4e148fed325439b53a1a", height: 1.85, what: "red classic slot with a chasing-bulb arched topper, side lever (one material, lights are painted)" },
  { id: "slot-jackpot", uid: "aff86b4e07fe4a22bc1b6bc3fa91d662", height: 1.83, mask: /^phong2$/, what: "modern upright slot, lit JACKPOT topper (emissive map on the cabinet sides)" },
  { id: "slot-lucky-spin", uid: "d58181162e154af2ab73e8667db2e81d", height: 1.6, what: "rounded red 'Lucky Spin' upright slot (one material)" },
  { id: "stanchion-brass-run", uid: "809c332e18f54d4784a94456fa1cecc8", height: 1.0, what: "three brass ball-top stanchions + two red velvet ropes (one mesh)" },
  { id: "stanchion-gold-pair", uid: "7bb310edac154c5b9ee9c3d6e41f13e2", keep: /^PolesRope$/, height: 1.086, mul: [1, 0.8, 0.5], what: "two thin gold posts + one red rope (cheap; repeatable)" },
  { id: "stanchion-sign-stand", uid: "7bb310edac154c5b9ee9c3d6e41f13e2", keep: /^PoleTable(Image)?$/, height: 1.308, mul: [1, 0.8, 0.5], what: "gold post with a framed sign card (retexture the card)" },
  { id: "column-marble", uid: "c17dfe2926ce48a6bbaca77dcc3a0d12", height: 4.48, what: "cream marble column, plinth + capital" },
  { id: "pilaster-fluted-gold", uid: "f54b9670ebae440b87c8f4db0fd19816", height: 2.97, tint: [0.80, 0.60, 0.22, 0.38], what: "fluted wall pilaster with base + capital, untextured — tinted gold (flat back, 9.5cm deep)" },
  { id: "cashier-counter", uid: "237f5748963644779985f550257fd8a6", height: 2.3, what: "L-shaped teller counter: wood base, stone cap, bronze-framed glass windows (cashier cage front)" },
  { id: "cashier-gate", uid: "da0862fd3dc246269c591c745610c686", height: 2.3, yaw: 90, what: "wrought-iron + wood double gate with bronze trim (the cage's side door)" },
  { id: "slot-stool", uid: "f795dda3a17948919e238f05778cd205", height: 0.795, what: "chrome pedestal stool, red cushion, foot ring" },
  { id: "chips-dice-set", uid: "f7ac7a2de860408596d989c213ea8ce6", width: 0.043, what: "loose low-poly chips (6 colours) + two chip stacks + dice, laid in a row" },
  { id: "chip-stack", uid: "cfff531b48e24073bc5f5c917b0d3519", width: 0.04, what: "one tall mixed-colour chip stack (photo-textured)" },
  { id: "dice-red-pair", uid: "995ac5d09d944d31ac587f0f90e36ca2", height: 0.019, what: "two red casino dice, 19mm" },
  { id: "neon-casino", uid: "2043019fd0ec4834a489b3d9d549980f", width: 2.0, yaw: 180, what: "flat pixel-style neon 'CASINO' panel (emissive texture), faces +Z after the yaw" },
  { id: "neon-bar", uid: "52d50a3b04ae414cb11b16df0d779054", width: 1.0, glow: true, what: "neon tube 'BAR' sign in a green rounded frame (colours made emissive)" },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const only = process.argv.slice(2);
const tris = (mesh) => mesh.listPrimitives().reduce((s, p) => s + Math.round((p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3), 0);

for (const r of RECIPES) {
  if (only.length && !only.includes(r.id)) continue;
  const src = `${R}/assets/downloads/sketchfab/${r.uid}/model.glb`;
  const credit = JSON.parse(readFileSync(`${R}/assets/downloads/sketchfab/${r.uid}/credit.json`, "utf8"));
  const doc = await io.read(src);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];

  // 1. keep only the wanted nodes (searched anywhere in the tree)
  if (r.keep) {
    const keepers = root.listNodes().filter((n) => r.keep.test(n.getName()));
    if (!keepers.length) throw new Error(`${r.id}: no node matches ${r.keep}`);
    const keepSet = new Set();
    for (const k of keepers) k.traverse((n) => keepSet.add(n));
    // detach the keepers to the scene (world transform preserved by flatten later), drop the rest
    for (const n of root.listNodes()) {
      if (keepSet.has(n)) continue;
      if (keepers.some((k) => { let p = k; while ((p = p.getParentNode?.() ?? null)) if (p === n) return true; return false; })) continue; // ancestors of keepers stay for their transforms
      // a node that is neither kept nor an ancestor: strip its mesh, keep structure
      n.setMesh(null);
    }
  }
  // 2. wrap everything under one node we can scale/centre
  const wrap = doc.createNode("vegas_root");
  for (const c of scene.listChildren()) { scene.removeChild(c); wrap.addChild(c); }
  scene.addChild(wrap);
  const b0 = getBounds(wrap);
  const size0 = b0.max.map((v, i) => v - b0.min[i]);
  const s = r.height ? r.height / size0[1] : r.width / size0[0];
  const yaw = ((r.yaw ?? 0) * Math.PI) / 180;
  wrap.setScale([s, s, s]);
  wrap.setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
  const b1 = getBounds(wrap);
  const c = [(b1.min[0] + b1.max[0]) / 2, b1.min[1], (b1.min[2] + b1.max[2]) / 2];
  wrap.setTranslation([-c[0], -c[1], -c[2]]);

  // 3. bake: every mesh node to the scene root, transforms into the vertices
  await doc.transform(flatten());
  for (const n of root.listNodes()) if (n.getMesh()) clearNodeTransform(n);
  for (const n of root.listNodes()) if (!n.getMesh()) n.dispose();
  for (const n of root.listNodes()) if (!n.getParentNode() && !scene.listChildren().includes(n)) scene.addChild(n);

  // 4. materials: metallic 0, BLEND single-sided, cut-outs to MASK, glow + tint where asked
  for (const m of root.listMaterials()) {
    m.setMetallicFactor(0);
    if (r.mask?.test(m.getName())) { m.setAlphaMode("MASK"); m.setAlphaCutoff(0.5); }
    if (m.getAlphaMode() === "BLEND") m.setDoubleSided(false);
    if (r.tint) { m.setBaseColorFactor([r.tint[0], r.tint[1], r.tint[2], 1]); m.setRoughnessFactor(r.tint[3]); }
    if (r.mul) m.setBaseColorFactor([r.mul[0], r.mul[1], r.mul[2], 1]);
    if (r.glow) { const bc = m.getBaseColorFactor(); m.setEmissiveFactor([bc[0], bc[1], bc[2]]); }
  }
  // 5. tidy + merge primitives per material
  await doc.transform(prune(), dedup(), join({ keepNamed: false }), prune());
  for (const [i, n] of root.listNodes().entries()) n.setName(`${r.id}_${i}`);
  root.getAsset().extras = { title: credit.title, author: credit.author, license: credit.license, source: credit.url, processed: "Solace vegas intake (scale, bake, metallic 0, single-sided blend)" };

  const tmp = `${TMP}/${r.id}.glb`;
  await io.write(tmp, doc);
  const out = `${OUT}/${r.id}.glb`;
  execFileSync("node", [`${R}/scripts/shrink-glb.mjs`, tmp, out, "1024", "4"], { stdio: ["ignore", "pipe", "inherit"] });

  // 6. measure the shipped file
  const fin = await io.read(out);
  const fr = fin.getRoot();
  const fs = fr.getDefaultScene() ?? fr.listScenes()[0];
  const fb = getBounds(fs);
  const round = (v) => Math.round(v * 1000) / 1000;
  const objects = fr.listNodes().filter((n) => n.getMesh()).map((n) => {
    const nb = getBounds(n);
    return { name: n.getName(), dim: nb.max.map((v, i) => round(v - nb.min[i])), loc: nb.min.map((v, i) => round((v + nb.max[i]) / 2)), tris: tris(n.getMesh()), mats: [...new Set(n.getMesh().listPrimitives().map((p) => p.getMaterial()?.getName()).filter(Boolean))] };
  });
  const manifest = {
    file: `vegas/${r.id}.glb`, id: r.id, what: r.what,
    size: fb.max.map((v, i) => round(v - fb.min[i])), minY: round(fb.min[1]), frontFaces: "+Z",
    tris: objects.reduce((a, o) => a + o.tris, 0), drawCalls: fr.listMeshes().reduce((a, m) => a + m.listPrimitives().length, 0), bytes: statSync(out).size,
    materials: fr.listMaterials().map((m) => ({ name: m.getName(), alpha: m.getAlphaMode(), doubleSided: m.getDoubleSided(), metallic: m.getMetallicFactor(), roughness: round(m.getRoughnessFactor()), emissive: m.getEmissiveTexture() ? "map" : m.getEmissiveFactor().some((v) => v > 0) ? "factor" : null, textures: [m.getBaseColorTexture() && "base", m.getNormalTexture() && "normal", m.getMetallicRoughnessTexture() && "orm", m.getEmissiveTexture() && "emit"].filter(Boolean) })),
    credit: { title: credit.title, author: credit.author, license: credit.license, url: credit.url },
    sourceScale: round(s),
    objects,
  };
  writeFileSync(`${MAN}/vegas-${r.id}.json`, JSON.stringify(manifest, null, 1));
  console.log(`${r.id.padEnd(22)} ${manifest.size.join("×")}m  ${manifest.tris} tris  ${manifest.drawCalls} draws  ${(manifest.bytes / 1e6).toFixed(2)}MB`);
}
