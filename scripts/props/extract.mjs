// EXTRACT EVERY PROP — stage 1 of the prop catalogue.
//
//   node scripts/props/extract.mjs [--only=<sourceId>]
//
// Reads scripts/props/sources.mjs, and for every model file there:
//   1. converts an FBX to GLB (fbx2gltf), binding the textures the FBX lost
//   2. cuts it into props (whole / one per top-level piece / overlapping
//      pieces together)
//   3. makes each prop STANDARD: metres, centred on x/z, standing on y = 0,
//      textures at most 512px, geometry at most ~25k triangles
//   4. measures it
// and writes each to assets/_propcache/pieces/<key>.glb with an inventory at
// assets/_propcache/inventory.json. Nothing here is shipped — stage 2
// (scripts/props/build.mjs) turns the NAMED pieces into the catalogue.
//
// assets/ is gitignored; the cache is scratch and can be deleted any time.

import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, textureCompress, weld, simplify, dedup } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES } from "./sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = path.join(ROOT, "assets", "_propcache");
const PIECES = path.join(CACHE, "pieces");
const FBXOUT = path.join(CACHE, "fbx");
const FBX2GLTF = path.join(ROOT, "node_modules", "fbx2gltf", "bin", "Windows_NT", "FBX2glTF.exe");
const MAX_TRIS = 25000;
const TEX_PX = 512;
mkdirSync(PIECES, { recursive: true });
mkdirSync(FBXOUT, { recursive: true });

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\.(glb|fbx)$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "piece";

function listFiles(src) {
  if (src.file) return [path.join(ROOT, src.file)];
  if (src.files) return src.files.map((f) => path.join(ROOT, f));
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (src.match.test(f) && !(src.skip && src.skip.test(p))) out.push(p);
    }
  };
  walk(path.join(ROOT, src.dir));
  return out.sort();
}

// ---- textures an FBX lost -----------------------------------------------------------
const KIT_TEX = path.join(ROOT, "assets", "TheBackroomsAndPoolrooms_Textures", "Textures");
const allPngs = (d) => {
  const out = [];
  const walk = (q) => {
    if (!existsSync(q)) return;
    for (const f of readdirSync(q)) {
      const p = path.join(q, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.png$/i.test(f)) out.push(p);
    }
  };
  walk(d);
  return out;
};
const kitPngs = { kit0: allPngs(path.join(KIT_TEX, "The Backrooms")), kit1: allPngs(path.join(KIT_TEX, "The Poolrooms")) };

function findTextures(src, fbxFile, materialName) {
  const pick = (list, kinds) => list.find((p) => kinds.some((k) => path.basename(p).toLowerCase().includes(k)));
  if (src.textures === "sibling") {
    const sib = readdirSync(path.dirname(fbxFile)).filter((f) => /\.png$/i.test(f)).map((f) => path.join(path.dirname(fbxFile), f));
    return { base: pick(sib, ["base_color", "_base", "basecolor", "albedo", "diffuse"]), normal: pick(sib, ["normal"]) };
  }
  if (src.textures === "kit0") {
    // Every Level 0 kit FBX names its material "UV_Checker", so the match is
    // by FILE NAME → the pack's texture folder. Order matters (first wins).
    const stem = path.basename(fbxFile, ".fbx").toLowerCase();
    const FOLDERS = [
      [/^wall_trim/, "Wall_trim"], [/^woodtrim/, "WoodTrim"],
      [/^ceiling_light_large/, "Ceiling_light_large"], [/^ceiling_light_small/, "Ceiling_light_small"],
      [/^ceiling_vent/, "Ceiling_vent_large"], [/^ceiling/, "Ceiling"], [/^floor|^pitfall/, "Floor"],
      [/^prop_doorway_large/, "Prop_doorway_large"], [/^prop_doorway_med/, "Prop_doorway_med"], [/^prop_door/, "Prop_door"],
      [/^prop_(pushbar|wallsocket)/, "Props_pushbarAndWallSocket"], [/^wall/, "Wallpaper"],
    ];
    const folder = FOLDERS.find(([re]) => re.test(stem))?.[1];
    const cand = folder ? kitPngs.kit0.filter((p) => path.basename(path.dirname(p)) === folder) : [];
    return { base: pick(cand, ["basecolor"]), normal: pick(cand, ["normal"]), emissive: pick(cand, ["emissive"]) };
  }
  if (src.textures === "kit1") {
    const list = kitPngs[src.textures];
    const m = String(materialName || "").toLowerCase().replace(/_?mat(erial)?$/, "");
    // the model's own name first, then its material, then its family
    const stem = path.basename(fbxFile, ".fbx").toLowerCase();
    const family = [stem, m, stem.split("_")[0], m.split("_")[0]].filter(Boolean);
    for (const key of family) {
      const cand = list.filter((p) => p.toLowerCase().includes(key));
      const base = pick(cand, ["basecolor", "base_color", "albedo"]);
      if (base) return { base, normal: pick(cand, ["normal"]) };
    }
    const fallback = src.textures === "kit1" ? "tile" : stem.includes("trim") ? "trim" : stem.includes("ceiling") ? "ceiling" : stem.includes("floor") ? "floor" : "wall";
    const cand = list.filter((p) => p.toLowerCase().includes(fallback));
    return { base: pick(cand, ["basecolor", "base_color"]), normal: pick(cand, ["normal"]) };
  }
  return {};
}

/** The casino pack names its materials after the two shared atlases the
 *  casino binds itself (client/src/casino/world.ts). WebP inside a GLB needs
 *  an extension, so they go in as PNG. */
const ATLAS = {};
async function atlasPng(n) {
  if (!ATLAS[n]) ATLAS[n] = await sharp(readFileSync(path.join(ROOT, "client", "public", "assets", "casino", `atlas-${n}.webp`))).png().toBuffer();
  return ATLAS[n];
}
async function bindAtlas(doc) {
  for (const mat of doc.getRoot().listMaterials()) {
    const m = mat.getName().toLowerCase().replace(/[^a-z0-9]/g, "");
    const n = m.includes("atlas1") ? 1 : m.includes("atlas2") ? 2 : 0;
    if (!n || mat.getBaseColorTexture()) continue;
    mat.setBaseColorTexture(doc.createTexture(`atlas-${n}`).setImage(await atlasPng(n)).setMimeType("image/png"));
    mat.setBaseColorFactor([1, 1, 1, 1]);
  }
}

function bindLostTextures(doc, src, fbxFile) {
  for (const mat of doc.getRoot().listMaterials()) {
    const hasImage = (t) => t && t.getImage() && t.getImage().length > 100;
    const tex = findTextures(src, fbxFile, mat.getName());
    if (!hasImage(mat.getBaseColorTexture()) && tex.base) {
      const t = doc.createTexture(path.basename(tex.base)).setImage(readFileSync(tex.base)).setMimeType("image/png");
      mat.setBaseColorTexture(t);
      mat.setBaseColorFactor([1, 1, 1, 1]);
    }
    if (!hasImage(mat.getNormalTexture()) && tex.normal) {
      const t = doc.createTexture(path.basename(tex.normal)).setImage(readFileSync(tex.normal)).setMimeType("image/png");
      mat.setNormalTexture(t);
    }
    if (tex.emissive && !hasImage(mat.getEmissiveTexture())) {
      mat.setEmissiveTexture(doc.createTexture(path.basename(tex.emissive)).setImage(readFileSync(tex.emissive)).setMimeType("image/png"));
      mat.setEmissiveFactor([1, 1, 1]);
    }
    // an FBX that lost its textures often leaves empty texture slots behind
    for (const getSet of [["getMetallicRoughnessTexture", "setMetallicRoughnessTexture"], ["getOcclusionTexture", "setOcclusionTexture"], ["getEmissiveTexture", "setEmissiveTexture"]]) {
      const t = mat[getSet[0]]();
      if (t && !hasImage(t)) mat[getSet[1]](null);
    }
    if (!hasImage(mat.getBaseColorTexture())) mat.setBaseColorTexture(null);
    if (!hasImage(mat.getNormalTexture())) mat.setNormalTexture(null);
    mat.setMetallicFactor(Math.min(mat.getMetallicFactor(), 0.2));
  }
}

// ---- cutting a file into props ----------------------------------------------------------
function topNodes(doc) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  let top = scene.listChildren();
  // never descend INTO an animated node: a frameless door is prop → hinge →
  // leaf, and cutting below the hinge throws its "open" clip away
  const animated = new Set(doc.getRoot().listAnimations().flatMap((a) => a.listChannels().map((c) => c.getTargetNode())));
  while (top.length === 1 && !top[0].getMesh() && top[0].listChildren().length && !animated.has(top[0])) top = top[0].listChildren();
  return { scene, top };
}
const hasMesh = (n) => {
  let yes = false;
  n.traverse((q) => {
    if (q.getMesh()) yes = true;
  });
  return yes;
};

/** An untextured, near-white piece with no atlas to bind. The bar pack sits
 *  its props on grey placeholder boxes (plinths from its preview scene), and
 *  the cluster rule would fuse a table to the box it stands on. Dropped when a
 *  source sets `dropBlank`. */
function isBlank(n) {
  let any = false;
  let blank = true;
  n.traverse((q) => {
    const mesh = q.getMesh();
    if (!mesh) return;
    for (const p of mesh.listPrimitives()) {
      any = true;
      const m = p.getMaterial();
      if (!m) continue;
      const f = m.getBaseColorFactor();
      if (m.getBaseColorTexture() || /atlas/i.test(m.getName()) || Math.min(f[0], f[1], f[2]) < 0.6) blank = false;
    }
  });
  return any && blank;
}

function groupsOf(doc, split, dropBlank) {
  const { top } = topNodes(doc);
  const meshy = top.map((n, i) => ({ n, i })).filter((q) => hasMesh(q.n) && !(dropBlank && isBlank(q.n)));
  if (split === "whole") return [meshy.map((q) => q.i)];
  if (split === "nodes") return meshy.map((q) => [q.i]);
  // cluster: union pieces whose boxes overlap (with a small tolerance)
  const boxes = meshy.map((q) => getBounds(q.n));
  const parent = meshy.map((_, k) => k);
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (let a = 0; a < meshy.length; a++) {
    for (let b = a + 1; b < meshy.length; b++) {
      const A = boxes[a];
      const B = boxes[b];
      // One prop when a SMALL piece touches a bigger one (a cap on its
      // barrel, a dial on its cylinder, a handle on its can), or when two
      // pieces sit mostly inside each other. Two similar-sized objects that
      // merely touch stay apart — that is how the pack lays four barrels
      // side by side.
      const vol = (q) => Math.max(1e-9, (q.max[0] - q.min[0]) * (q.max[1] - q.min[1]) * (q.max[2] - q.min[2]));
      const inter = [0, 1, 2].reduce((acc, k) => acc * Math.max(0, Math.min(A.max[k], B.max[k]) - Math.max(A.min[k], B.min[k])), 1);
      const small = Math.min(vol(A), vol(B)) / Math.max(vol(A), vol(B)) < 0.25;
      const tol = 0.03 * Math.max(...[0, 1, 2].map((k) => Math.max(A.max[k] - A.min[k], B.max[k] - B.min[k])));
      const touch = [0, 1, 2].every((k) => A.min[k] <= B.max[k] + tol && B.min[k] <= A.max[k] + tol);
      if ((small && touch) || inter / Math.min(vol(A), vol(B)) > 0.6) parent[find(a)] = find(b);
    }
  }
  const byRoot = new Map();
  meshy.forEach((q, k) => {
    const r = find(k);
    byRoot.set(r, [...(byRoot.get(r) ?? []), q.i]);
  });
  return [...byRoot.values()];
}

/** A document holding only the pieces in `keep`, standardised. */
async function cut(bytes, keep, src, fbxFile, unit) {
  const doc = await io.readBinary(bytes);
  if (fbxFile) bindLostTextures(doc, src, fbxFile);
  // The Level 0 kit's doors, sockets, trims and crawlspaces carry a black
  // vertex-colour channel (a mask from the authoring tool), and glTF
  // multiplies it into the texture: those pieces render solid black.
  if (src.dropVertexColor)
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute("COLOR_0", null);
  // A few kit pieces (the trims) were exported WITHOUT UVs, so a texture can't
  // be mapped onto them and prune would silently drop it, leaving them black.
  // They get the texture's average colour instead.
  for (const mat of doc.getRoot().listMaterials()) {
    const t = mat.getBaseColorTexture();
    if (!t) continue;
    const users = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial() === mat);
    if (users.length && users.every((p) => !p.getAttribute("TEXCOORD_0"))) {
      const stats = await sharp(Buffer.from(t.getImage())).stats();
      const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      mat.setBaseColorFactor([...stats.channels.slice(0, 3).map((c) => lin(c.mean)), 1]);
      mat.setBaseColorTexture(null);
      mat.setNormalTexture(null);
    }
  }
  if (src.textures === "casinoAtlas") await bindAtlas(doc);
  const { scene, top } = topNodes(doc);
  const root = doc.createNode("prop");
  const names = [];
  for (const i of keep) {
    const n = top[i];
    names.push(n.getName());
    const world = n.getWorldMatrix();
    const par = n.getParentNode();
    if (par) par.removeChild(n);
    else scene.removeChild(n);
    n.setMatrix(world);
    root.addChild(n);
  }
  for (const child of scene.listChildren()) {
    child.traverse((q) => q !== child && q.dispose());
    child.dispose();
  }
  scene.addChild(root);
  await doc.transform(prune(), dedup());
  // units: metres, standing on the floor, centred
  let b = getBounds(scene);
  const longest = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const s = typeof unit === "number" ? unit : unit === "cm" ? 0.01 : unit === "m" ? 1 : longest > 30 ? 0.01 : 1;
  root.setScale([s, s, s]);
  root.setTranslation([-((b.min[0] + b.max[0]) / 2) * s, -b.min[1] * s, -((b.min[2] + b.max[2]) / 2) * s]);
  // geometry and textures down to a size a scene of hundreds can afford
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
  if (tris > MAX_TRIS) {
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: MAX_TRIS / tris, error: 0.01 }));
    tris = 0;
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
  }
  // JPEG wherever no material needs the alpha channel (most of these packs
  // ship 4K PNGs, and a PNG photo is ~4x its JPEG at the same size)
  const seeThrough = doc.getRoot().listMaterials().some((m) => m.getAlphaMode() !== "OPAQUE");
  await doc.transform(
    textureCompress({ encoder: sharp, resize: [TEX_PX, TEX_PX], targetFormat: "jpeg", quality: 82, slots: /^(normal|occlusion|metallicRoughness|emissive)/ }),
    textureCompress({ encoder: sharp, resize: [TEX_PX, TEX_PX], ...(seeThrough ? {} : { targetFormat: "jpeg", quality: 85 }), slots: /^baseColor/ }),
    prune(),
  );
  b = getBounds(scene);
  return { doc, names, tris: Math.round(tris), size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((v) => Math.round(v * 1000) / 1000) };
}

// ---- run ------------------------------------------------------------------------------------
const invPath = path.join(CACHE, "inventory.json");
const inventory = existsSync(invPath) && only ? JSON.parse(readFileSync(invPath, "utf8")) : [];
const keepOthers = only ? inventory.filter((e) => e.source !== only) : [];
const out = [...keepOthers];
for (const src of SOURCES) {
  if (only && src.id !== only) continue;
  for (const file of listFiles(src)) {
    const base = path.basename(file);
    const split = src.except?.[base] ?? src.split;
    let glbFile = file;
    let fbxFile = null;
    if (/\.fbx$/i.test(file)) {
      fbxFile = file;
      const target = path.join(FBXOUT, `${src.id}__${slug(base)}`);
      if (!existsSync(target + ".glb")) {
        try {
          execFileSync(FBX2GLTF, ["-b", "-i", file, "-o", target], { stdio: "pipe" });
        } catch (e) {
          console.log(`  ! ${base}: fbx2gltf failed`);
          continue;
        }
      }
      glbFile = target + ".glb";
    }
    let bytes;
    let groups;
    try {
      bytes = readFileSync(glbFile);
      groups = groupsOf(await io.readBinary(bytes), split, src.dropBlank);
    } catch (e) {
      console.log(`  ! ${base}: ${e.message.slice(0, 80)}`);
      continue;
    }
    const used = new Set();
    for (const g of groups) {
      try {
        const r = await cut(bytes, g, src, fbxFile, src.unit);
        let key = `${src.id}__${slug(base)}${groups.length > 1 ? "__" + slug(r.names[0]) : ""}`;
        while (used.has(key)) key += "-b";
        used.add(key);
        const outFile = path.join(PIECES, `${key}.glb`);
        const data = await io.writeBinary(r.doc);
        writeFileSync(outFile, data);
        out.push({ key, source: src.id, from: path.relative(ROOT, file).split(path.sep).join("/"), parts: r.names, size: r.size, tris: r.tris, bytes: data.length, theme: src.theme, ...(src.credit ? { credit: src.credit } : {}) });
        console.log(`  ${key}  ${r.size.map((v) => v.toFixed(2)).join("×")}m  ${r.tris} tris  ${(data.length / 1024).toFixed(0)}KB`);
      } catch (e) {
        console.log(`  ! ${base} [${g.join(",")}]: ${e.message.slice(0, 100)}`);
      }
    }
  }
}
writeFileSync(invPath, JSON.stringify(out, null, 1));
console.log(`\n${out.length} pieces → ${path.relative(ROOT, invPath)}`);
