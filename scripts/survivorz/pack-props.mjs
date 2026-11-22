// SURVIVORZ: packs the downloaded props in props-spec.mjs into game-ready GLBs.
//
//   node scripts/survivorz/pack-props.mjs              every prop not packed yet
//   node scripts/survivorz/pack-props.mjs bunk-bed …   just these (repacked)
//   node scripts/survivorz/pack-props.mjs --all        everything, again
//   … --shard 2/3      only every third prop, starting at the second (run three at once:
//                      the KTX encode is the slow part and each prop is independent)
//   … --index          just rebuild props.json from props/meta/
//   → assets/downloads/survivorz/props/<id>.glb + props/props.json (gitignored: licensed)
//
// Each prop comes out in ONE convention, so the facility build can drop any of them in:
//   real metres, +Y up, the origin at the middle of its footprint on the floor (y = 0 is
//   the bottom of the model). A wall piece is placed by its back, not by this origin.
// What a pack does, in order:
//   1. material fixes from the spec (the few downloads with flat colours or none)
//   2. scales and centres it under one root node "prop" (fit: metres, a height, or a length)
//   3. cuts the triangle count to the tier's budget (meshopt simplify, seams kept)
//   4. shrinks every texture to the tier's size and encodes it KTX2 (UASTC + zstd, the
//      same settings the effects use): colour and emissive sRGB, everything else linear
//   5. drops what nothing uses, then meshopt-compresses the geometry
// The client loads these with assets.ts loadGlb, which hands GLTFLoader the shared KTX2Loader.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import { prune, dedup, weld, simplify, meshopt, getBounds, metalRough } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { PROPS, TIERS } from "./props-spec.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const FREE = path.join(STAGE, "free");
const SRC = path.join(STAGE, "src", "free");
const OUT = path.join(STAGE, "props");
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "solace-props-"));

const args = process.argv.slice(2);
const all = args.includes("--all");
const shardArg = args.includes("--shard") ? args[args.indexOf("--shard") + 1] : null;
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--shard");
for (const id of only) if (!PROPS[id]) throw new Error(`no prop "${id}" in props-spec.mjs`);

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const log = JSON.parse(fs.readFileSync(path.join(FREE, "LOG.json"), "utf8"));
// one meta file per prop (so several packers can run at once), gathered into props.json
const META = path.join(OUT, "meta");
const indexFile = path.join(OUT, "props.json");
function writeIndex() {
  const all = {};
  for (const f of fs.existsSync(META) ? fs.readdirSync(META).sort() : []) all[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(META, f), "utf8"));
  fs.writeFileSync(indexFile, JSON.stringify(all, null, 1));
  // the credits file ASSETS.md §1 asks for: one line per asset (CC BY needs it in the stream credits)
  const lines = Object.entries(all).map(([id, m]) => `${id}: ${m.credit ?? "(no credit recorded)"} [${m.licence ?? "?"}] ${m.source ?? ""}`);
  fs.writeFileSync(path.join(OUT, "CREDITS.txt"), `SOLACE SURVIVORZ: the packed props, where each came from\n\n${lines.join("\n")}\n`);
  return Object.keys(all).length;
}
if (args.includes("--index")) { console.log(writeIndex(), "props in props.json"); process.exit(0); }

/** the source glTF for a spec src, extracting a Sketchfab zip into src/free/<uid>/ once */
function sourceOf(src) {
  const [kind, id] = src.split(/:(.*)/);
  if (kind === "file") return { file: path.join(ROOT, id), logKey: null };
  if (kind === "ph") {
    const dir = path.join(FREE, "polyhaven", id);
    const f = fs.existsSync(dir) && fs.readdirSync(dir).find((n) => n.endsWith(".gltf"));
    if (!f) throw new Error(`no glTF for Poly Haven ${id} (fetch it: fetch-free.mjs polyhaven)`);
    return { file: path.join(dir, f), logKey: `polyhaven:${id}` };
  }
  const zip = path.join(FREE, "sketchfab", `${id}.zip`);
  if (!fs.existsSync(zip)) throw new Error(`not downloaded: sketchfab ${id}`);
  const dir = path.join(SRC, id);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); execFileSync("C:/Windows/System32/tar.exe", ["-xf", zip, "-C", dir]); }
  const f = fs.readdirSync(dir, { recursive: true }).map((n) => path.join(dir, n)).find((n) => /\.(gltf|glb)$/i.test(n));
  if (!f) throw new Error(`no glTF in ${zip}`);
  return { file: f, logKey: `sketchfab:${id}` };
}

const triCount = (doc) => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    if (p.getMode() !== 4) continue;
    const i = p.getIndices();
    t += (i ? i.getCount() : p.getAttribute("POSITION").getCount()) / 3;
  }
  return Math.round(t);
};
const sceneOf = (doc) => doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const dims = (b) => b.max.map((v, k) => v - b.min[k]);

async function pack(id) {
  const spec = PROPS[id];
  // a spec's own `tris` outranks its tier's: a baked-atlas model (hundreds of tiny UV islands) can't be
  // simplified without tearing its texture apart, so it ships whole
  const tier = { ...TIERS[spec.tier], ...(spec.tris ? { tris: spec.tris } : {}) };
  const { file, logKey } = sourceOf(spec.src);
  const doc = await io.read(file);
  const root = doc.getRoot();
  // other scenes (a few Sketchfab files carry spares) go
  const scene = sceneOf(doc);
  for (const s of root.listScenes()) if (s !== scene) s.dispose();
  root.setDefaultScene(scene);
  for (const c of root.listCameras()) c.dispose();
  // keep: only these mesh nodes (a part cut out of a bigger kit, e.g. a rifle's sling)
  if (spec.keep) {
    for (const n of root.listNodes()) if (n.getMesh() && !spec.keep.test(n.getName())) n.dispose();
    await doc.transform(prune());   // or the cut parts' meshes count against the budget
  }

  // 1. materials. Old Sketchfab exports use specular-glossiness, which three.js no longer
  // reads (those props render white): convert it. Glass made with transmission becomes plain
  // see-through glass, so a prop never needs the renderer's extra transmission pass.
  await doc.transform(metalRough());
  // only triangles: some Sketchfab files carry an edge-line or point primitive beside the
  // surface (the steel sink's drew a white wireframe over every edge)
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) if (p.getMode() < 4) p.dispose();
  for (const m of root.listMaterials()) {
    const tr = m.getExtension("KHR_materials_transmission");
    if (tr) {
      const f = m.getBaseColorFactor();
      m.setExtension("KHR_materials_transmission", null).setExtension("KHR_materials_volume", null);
      m.setAlphaMode("BLEND").setBaseColorFactor([f[0], f[1], f[2], Math.min(f[3], 0.2)]).setRoughnessFactor(Math.min(m.getRoughnessFactor(), 0.15));
    }
  }
  for (const m of root.listMaterials()) {
    const fix = spec.mat?.[m.getName()] ?? spec.mat?.["*"];
    if (!fix) continue;
    if (fix.name) m.setName(fix.name);
    if (fix.color) m.setBaseColorFactor([...fix.color, fix.alpha ?? 1]);
    if (fix.alpha != null) m.setAlphaMode(fix.alpha < 1 ? "BLEND" : "OPAQUE");
    if (fix.metal != null) m.setMetallicFactor(fix.metal);
    if (fix.rough != null) m.setRoughnessFactor(fix.rough);
  }
  // art: a print of our own in a frame's artwork material (room-art.mjs draws them); its paper
  // normal map goes too, or the old print's embossing shows through the new one
  if (spec.art) {
    const m = root.listMaterials().find((x) => x.getName() === spec.art.material);
    if (!m) throw new Error(`${id}: no material ${spec.art.material} for its art`);
    const tex = doc.createTexture(`${id}-art`).setImage(new Uint8Array(fs.readFileSync(path.join(ROOT, spec.art.image)))).setMimeType("image/png");
    m.setBaseColorTexture(tex).setNormalTexture(null).setBaseColorFactor([1, 1, 1, 1]);
  }
  // powerOff: the facility has no mains power, so a screen or an LED that glows in the model's
  // own art is switched off: wherever the emissive map is lit, the colour map goes to a dead
  // screen's near-black, and the glow is dropped (a wallpaper on a dead monitor gives the game away)
  if (spec.powerOff) {
    for (const m of root.listMaterials()) {
      const em = m.getEmissiveTexture(), base = m.getBaseColorTexture();
      if (!em) continue;
      if (base) {
        const meta = await sharp(Buffer.from(base.getImage())).metadata();
        const lum = await sharp(Buffer.from(em.getImage())).resize(meta.width, meta.height, { fit: "fill" }).greyscale().raw().toBuffer();
        const { data, info } = await sharp(Buffer.from(base.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < info.width * info.height; i++) {
          const k = Math.min(1, Math.max(0, (lum[i] - 8) / 40));   // how lit this texel is: a screen glows at ~90, so it goes fully dark
          for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * (1 - k) + 12 * k);
        }
        base.setImage(new Uint8Array(await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer())).setMimeType("image/png");
      }
      m.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
    }
  }

  // 2. real size, centred on its footprint, standing on y = 0
  const before = getBounds(scene);
  const d0 = dims(before);
  const [how, want] = spec.fit;
  const s = how === "m" ? 1 : how === "h" ? want / d0[1] : want / Math.max(...d0);
  if (!isFinite(s) || s <= 0) throw new Error(`bad bounds ${d0}`);
  const holder = doc.createNode("prop").setScale([s, s, s]).setTranslation([
    -s * (before.min[0] + before.max[0]) / 2, -s * before.min[1], -s * (before.min[2] + before.max[2]) / 2]);
  for (const child of scene.listChildren()) { scene.removeChild(child); holder.addChild(child); }
  scene.addChild(holder);

  // 3. the triangle budget
  await doc.transform(dedup());
  const tris0 = triCount(doc);
  if (tris0 > tier.tris) {
    await doc.transform(weld());
    // some downloads (many small separate pieces) only reach the budget at a looser error
    for (const error of [0.002, 0.005, 0.01, 0.02, 0.05, 0.1]) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: tier.tris / triCount(doc), error }));
      if (triCount(doc) <= tier.tris * 1.05) break;
    }
    // still over: texture seams can stop the careful simplifier collapsing anything (a pack
    // of separately-UVed cans, a tiled tunnel). The sloppy one ignores seams and keeps every
    // vertex it uses as it was, so the textures stay put; it rounds small detail off.
    if (triCount(doc) > tier.tris * 1.05) {
      const ratio = tier.tris / triCount(doc);
      for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
        const idx = p.getIndices();
        if (p.getMode() !== 4 || !idx) continue;
        const pos = p.getAttribute("POSITION").getArray();
        const positions = pos instanceof Float32Array ? pos : Float32Array.from(pos);
        const target = Math.max(3, Math.floor(idx.getCount() * ratio / 3) * 3);
        const [out] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(idx.getArray()), positions, 3, null, Math.min(target, idx.getCount()), 0.05);
        if (out.length >= 3) idx.setArray(new Uint32Array(out));
      }
    }
  }

  // 4. textures → KTX2 at the tier's size
  const srgb = new Set();
  for (const m of root.listMaterials()) for (const t of [m.getBaseColorTexture(), m.getEmissiveTexture()]) if (t) srgb.add(t);
  let n = 0;
  for (const tex of root.listTextures()) {
    const img = tex.getImage();
    if (!img) continue;
    const png = path.join(TMP, `${id}-${n}.png`), k2 = png.replace(/\.png$/, ".ktx2");
    const meta = await sharp(Buffer.from(img)).metadata();
    const side = Math.max(meta.width, meta.height);
    const cap = Math.min(tier.tex, side);
    // power-of-two sides keep the GPU's block formats and mipmaps happy
    const p2 = (v) => 2 ** Math.round(Math.log2(Math.max(4, v * cap / side)));
    await sharp(Buffer.from(img)).resize(p2(meta.width), p2(meta.height), { fit: "fill" }).ensureAlpha().png().toFile(png);
    const color = srgb.has(tex);
    execFileSync(KTX, ["create", "--format", color ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM", "--assign-tf", color ? "srgb" : "linear",
      "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--zstd", "18", "--generate-mipmap", png, k2], { stdio: ["ignore", "ignore", "inherit"] });
    tex.setImage(new Uint8Array(fs.readFileSync(k2))).setMimeType("image/ktx2").setURI(`${id}-${n}.ktx2`);
    fs.rmSync(png); fs.rmSync(k2);
    n++;
  }
  if (n) doc.createExtension(KHRTextureBasisu).setRequired(true);

  // pivots: nodes whose ORIGIN matters (a door leaf's hinge). Compression quantizes each mesh
  // and moves its node to fit, so the mesh goes on a child "<name>-mesh" that compression may
  // move, and the named node keeps its origin, untouched, with nothing on it.
  for (const name of spec.pivots ?? []) {
    const n = root.listNodes().find((x) => x.getName() === name);
    if (!n?.getMesh()) throw new Error(`pivot ${name}: no such node with a mesh`);
    n.addChild(doc.createNode(`${name}-mesh`).setMesh(n.getMesh()));
    n.setMesh(null);
  }

  // 5. clean up and compress
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const after = getBounds(sceneOf(doc));
  const out = path.join(OUT, `${id}.glb`);
  fs.mkdirSync(OUT, { recursive: true });
  await io.write(out, doc);
  const lg = log[logKey] ?? {};
  const meta = {
    file: `${id}.glb`, fills: spec.fills, note: spec.note ?? null, tier: spec.tier,
    size: dims(after).map((v) => +v.toFixed(3)), tris: triCount(doc), trisSource: tris0, textures: n,
    bytes: fs.statSync(out).size, source: lg.page ?? spec.source ?? spec.src, licence: lg.licence ?? spec.licence ?? null, credit: lg.credit ?? spec.credit ?? null,
    packed: new Date().toISOString(),
  };
  fs.mkdirSync(META, { recursive: true });
  // a grip worked out by prop-grips.mjs survives a repack (rerun prop-grips if the shape changed)
  const old = path.join(META, `${id}.json`);
  if (fs.existsSync(old)) { const g = JSON.parse(fs.readFileSync(old, "utf8")).grip; if (g) meta.grip = g; }
  fs.writeFileSync(path.join(META, `${id}.json`), JSON.stringify(meta, null, 1));
  const i = meta;
  return `${String(i.tris).padStart(6)}t (from ${tris0})  ${n} tex  ${i.size.join(" x ")} m  ${(i.bytes / 1e6).toFixed(1)} MB`;
}

let ids = only.length ? only : Object.keys(PROPS).filter((id) => all || !fs.existsSync(path.join(META, `${id}.json`)));
if (shardArg) { const [k, n] = shardArg.split("/").map(Number); ids = ids.filter((_, i) => i % n === k - 1); }
let ok = 0, bad = 0;
for (const id of ids) {
  try { console.log(`${id.padEnd(22)} ${await pack(id)}`); ok++; }
  catch (e) { console.log(`${id.padEnd(22)} FAILED ${e.message}`); bad++; }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`done: ${ok} packed, ${bad} failed; ${writeIndex()} props in props.json`);
