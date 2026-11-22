// THE PROP KIT BUILD — stage 3 of the prop pipeline. Turns the curated list
// (scripts/props/curate.mjs) into what the game and the editor load:
//
//   client/public/assets/propkit/<file>.gltf+.bin one per prop variant, in metres,
//                                                standing on y=0, centred on x/z
//   client/public/assets/propkit/tex/<hash>.webp     textures, shared between props
//   client/public/assets/propkit/thumbs/<file>.webp  the browser's pictures
//   src/backrooms/props-catalog.json             THE CATALOGUE — read by the
//                                                server (ids, footprints) and
//                                                the editor (names, search)
//
//   node scripts/props/extract.mjs     (once per pack change — slow)
//   node scripts/props/build.mjs       ← this: GLBs + the catalogue
//   then render thumbnails of the BUILT files: serve the repo
//   (node scripts/serve-root.mjs 8791), open /scripts/props/thumbs.html in a
//   browser (Playwright), and for each name in assets/_propcache/kitfiles.json
//   call window.show("/client/public/assets/propkit/<file>.gltf") and
//   screenshot the #c canvas to assets/_propcache/kitthumbs/<file>.png; then
//   node scripts/props/build.mjs --thumbs
//
// Adding a prop: find its piece on the contact sheets (scripts/props/sheet.html),
// add a line to curate.mjs, run the build and the thumbnails. Never rename an
// id a map already places — maps store ids.
//
// A <file> is the prop id, or `<id>--<n>` for its n-th variant (n from 1).

import { writeKitCosts } from "./cost.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { prune, weld, simplify, meshopt } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { CATALOG, CARD_VARIANTS } from "./curate.mjs";
import { makeResolver } from "./resolve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = path.join(ROOT, "assets", "_propcache");
const OUT = path.join(ROOT, "client", "public", "assets", "propkit");
const THUMBS_IN = path.join(CACHE, "kitthumbs");
const CATALOG_OUT = path.join(ROOT, "src", "backrooms", "props-catalog.json");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const inv = JSON.parse(readFileSync(path.join(CACHE, "inventory.json"), "utf8"));
const resolve = makeResolver(inv);
const round = (v, d = 1000) => Math.round(v * d) / d;

/** Which levels a theme belongs to — the editor's default filter per level. */
const LEVELS_OF = { backrooms: [0], office: [0], poolrooms: [1], industrial: [2, 3], station: [3], hotel: [5], ruin: [6] };

function variantsOf(c) {
  if (c.v === "CARDS") return CARD_VARIANTS;
  if (typeof c.v === "string") return [[c.v, ""]];
  return c.v;
}

if (process.argv.includes("--thumbs")) {
  // ---- thumbnails: PNGs rendered from the built GLBs → small WebPs
  mkdirSync(path.join(OUT, "thumbs"), { recursive: true });
  let n = 0;
  for (const f of readdirSync(THUMBS_IN).filter((q) => q.endsWith(".png"))) {
    await sharp(path.join(THUMBS_IN, f)).resize(160, 160).webp({ quality: 80 }).toFile(path.join(OUT, "thumbs", f.replace(/\.png$/, ".webp")));
    n++;
  }
  console.log(`${n} thumbnails → ${path.relative(ROOT, path.join(OUT, "thumbs"))}`);
  process.exit(0);
}

// ---- writing one prop ------------------------------------------------------
// Each prop is a small .gltf + .bin whose textures live in a SHARED folder,
// tex/<content hash>.webp: the 53 cards all point at one atlas, the four drum
// colours share their normal map, and every pool piece shares the tile. A
// texture is loaded once however many props wear it. Texture size follows the
// prop: a thing you hold in one hand doesn't need 512 pixels.
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const TEX = path.join(OUT, "tex");
const written = new Set();
async function writeProp(doc, file, longest, trisBudget) {
  const px = longest < 0.6 ? 128 : longest < 2.5 ? 256 : 512;
  const root = doc.getRoot();
  // the game lights props with its own materials' roughness — these maps
  // cost bandwidth and draw nothing it uses
  for (const m of root.listMaterials()) {
    m.setOcclusionTexture(null);
    m.setMetallicRoughnessTexture(null);
  }
  // geometry: a triangle budget by size (a hand-held thing in a wall of
  // scenery doesn't need a showroom mesh), then meshopt — quantised and
  // entropy-coded; the game's loader registers three's MeshoptDecoder
  const budget = trisBudget ?? (longest < 0.6 ? 1500 : longest < 2.5 ? 5000 : 12000);
  const tris = root.listMeshes().flatMap((m) => m.listPrimitives()).reduce((a, q) => a + (q.getIndices()?.getCount() ?? q.getAttribute("POSITION").getCount()) / 3, 0);
  if (tris > budget) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: budget / tris, error: 0.02 }));
  let size = 0;
  const webp = doc.createExtension(EXTTextureWebP).setRequired(true);
  for (const t of root.listTextures()) {
    if (!t.listParents().some((p) => p !== root)) continue; // unused (pruned below)
    const alpha = root.listMaterials().some((m) => m.getAlphaMode() !== "OPAQUE" && m.getBaseColorTexture() === t);
    // the casino's two shared atlases hold a hundred props each: shrinking
    // one to fit a playing card would blur every prop on it, so they ship at
    // their own size (once — the hash is the same for every prop using it)
    const atlas = /^atlas-(d)$/.exec(t.getName());
    const img = atlas
      ? await sharp(path.join(ROOT, "client", "public", "assets", "casino", `atlas-${atlas[1]}.webp`)).webp({ quality: 82 }).toBuffer()
      : await sharp(Buffer.from(t.getImage())).resize(px, px, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80, alphaQuality: alpha ? 90 : 100 }).toBuffer();
    const name = `tex/${createHash("sha1").update(img).digest("hex").slice(0, 16)}.webp`;
    if (!written.has(name)) {
      writeFileSync(path.join(OUT, name), img);
      written.add(name);
      size += img.length;
    }
    t.setImage(img).setMimeType("image/webp").setURI(name);
  }
  if (!root.listTextures().length) webp.dispose();
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const bufs = root.listBuffers();
  for (let k = 1; k < bufs.length; k++) {
    for (const a of root.listAccessors()) if (a.getBuffer() === bufs[k]) a.setBuffer(bufs[0]);
    bufs[k].dispose();
  }
  bufs[0]?.setURI(`${file}.bin`);
  const { json, resources } = await io.writeJSON(doc, { format: "gltf", basename: file });
  writeFileSync(path.join(OUT, `${file}.gltf`), JSON.stringify(json));
  size += JSON.stringify(json).length;
  for (const [uri, data] of Object.entries(resources)) {
    if (uri.startsWith("tex/")) continue; // written once above
    writeFileSync(path.join(OUT, uri), data);
    size += data.length;
  }
  return size;
}

// ---- the props and the catalogue
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f !== "thumbs") rmSync(path.join(OUT, f), { recursive: true, force: true });
mkdirSync(TEX, { recursive: true });
const props = [];
let bytes = 0;
const ids = new Set();
/** Who made the models the kit ships, for CREDITS.txt (CC-BY requires it). */
const allCredits = new Set();
for (const c of CATALOG) {
  if (ids.has(c.id)) throw new Error(`duplicate prop id ${c.id}`);
  if (!/^[a-z0-9-]+$/.test(c.id)) throw new Error(`prop id ${c.id}: lowercase letters, digits and dashes only`);
  ids.add(c.id);
  const vs = variantsOf(c);
  const variants = [];
  const theme = new Set();
  const credits = new Set();
  for (let i = 0; i < vs.length; i++) {
    const [ref, label] = vs[i];
    const e = resolve(ref);
    if (!e) throw new Error(`${c.id}: no extracted piece for ${ref}`);
    e.theme.forEach((t) => theme.add(t));
    if (e.credit) credits.add(e.credit);
    const doc = await io.read(path.join(CACHE, "pieces", `${e.key}.glb`));
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    const wrap = doc.createNode("kit");
    for (const k of scene.listChildren()) {
      scene.removeChild(k);
      wrap.addChild(k);
    }
    scene.addChild(wrap);
    if (c.lay) wrap.setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2]); // on edge → flat
    let b = getBounds(scene);
    const k = (c.h ? c.h / (b.max[1] - b.min[1]) : 1) * (c.s ?? 1);
    wrap.setScale([k, k, k]);
    b = getBounds(scene);
    wrap.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
    b = getBounds(scene);
    const file = vs.length > 1 ? `${c.id}--${i + 1}` : c.id;
    bytes += await writeProp(doc, file, Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]), c.tris);
    variants.push({ file, label, size: [0, 1, 2].map((a) => round(b.max[a] - b.min[a])), piece: e.key });
  }
  props.push({
    id: c.id,
    name: c.name,
    cat: c.cat,
    tags: c.tags ?? [],
    theme: [...theme],
    levels: [...new Set([...theme].flatMap((t) => LEVELS_OF[t] ?? []))].sort(),
    mount: c.mount ?? "floor",
    solid: !c.walk,
    // a door (or anything else) whose file carries an "open" clip: the game
    // swings it open as somebody walks up (client world.ts)
    ...(c.anim ? { anim: c.anim } : {}),
    ...(credits.size ? { credit: [...credits].join(" · ") } : {}),
    variants,
  });
  for (const cr of credits) allCredits.add(cr);
}

// The catalogue is data other code reads by hand as often as by program, so
// it is written ONE PROP PER LINE: a diff shows exactly which prop changed.
const head = {
  note: "GENERATED by scripts/props/build.mjs from scripts/props/curate.mjs — edit the curated list, not this file.",
  base: "/assets/propkit/",
  count: props.length,
};
const body = props.map((p) => "  " + JSON.stringify(p)).join(",\n");
writeFileSync(CATALOG_OUT, `{\n${Object.entries(head).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(",\n")},\n"props": [\n${body}\n]}\n`);
writeFileSync(path.join(OUT, "CREDITS.txt"), `Models in the Solace prop kit made by other people, with their licences:\n\n${[...allCredits].sort().join("\n")}\n`);
const nv = props.reduce((a, p) => a + p.variants.length, 0);
console.log(`${props.length} props, ${nv} variants, ${(bytes / 1048576).toFixed(1)}MB → ${path.relative(ROOT, OUT)}`);
console.log(`catalogue → ${path.relative(ROOT, CATALOG_OUT)}`);
// the editor's cost meter reads what each built model costs to draw (cost.mjs)
console.log(`costed ${writeKitCosts()} models → src/backrooms/props-cost.json`);
// what the thumbnail pass needs to render
mkdirSync(THUMBS_IN, { recursive: true });
writeFileSync(path.join(CACHE, "kitfiles.json"), JSON.stringify(props.flatMap((p) => p.variants.map((v) => v.file))));
if (!existsSync(THUMBS_IN)) mkdirSync(THUMBS_IN);
