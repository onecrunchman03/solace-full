// THE TEXTURE INTAKE — the texture half of the new-asset intake (models go
// through scripts/props/intake.mjs). A downloaded texture becomes the game's
// two files, client/public/assets/br/tex/<stem>-color.jpg and -normal.jpg
// (1024px), and ONE append-only entry in src/backrooms/surfaces.ts — which
// this prints for you, credit and all, from the download's credit.json.
//
//   node scripts/assets/texture.mjs ambientcg/Metal027 black-metal
//        a fetched folder under assets/New Assets (or assets/downloads)
//   node scripts/assets/texture.mjs "Hotel Asset Pack.glb" hotel-wallpaper --material="Wallpaper 1"
//        one material out of a model pack: its base colour and normal maps
//
// ambientCG folders hold <id>_1K-JPG_Color.jpg + _NormalGL.jpg; Poly Haven's
// <id>_diff_1k.jpg + _nor_gl_1k.jpg. The OpenGL normal is the one three.js
// reads. Pass --move to file the source away in assets/downloads/ after.
//
// The surface's real SIZE (sizeM: how many metres one repeat covers) is a
// judgement — look at it on a wall in the editor's Walk it before settling
// (Wooden Panels at its own 2.1m read as a chest of drawers; 4.2m was right).
import sharp from "sharp";
import { existsSync, readdirSync, readFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const INBOX = join(ROOT, "assets", "New Assets");
const DOWNLOADS = join(ROOT, "assets", "downloads");
const OUT = join(ROOT, "client", "public", "assets", "br", "tex");
const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const [src, stem] = args.filter((a) => !a.startsWith("--"));
if (!src || !stem || !/^[a-z0-9-]+$/.test(stem)) {
  console.error("usage: texture.mjs <folder|pack.glb> <stem: lower-case-with-dashes> [--material=Name] [--move]");
  process.exit(1);
}
const where = [join(INBOX, src), join(DOWNLOADS, src), resolve(src)].find((p) => existsSync(p));
if (!where) throw new Error(`not found: ${src}`);

const write = async (buf, suffix, quality) => {
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, `${stem}-${suffix}.jpg`);
  await sharp(buf).resize(1024, 1024, { fit: "cover" }).jpeg({ quality, mozjpeg: true }).toFile(out);
  return out;
};

let color, normal, credit = null;
if (where.endsWith(".glb")) {
  // a model pack: pull the named material's own textures out of the file
  const { NodeIO } = await import("@gltf-transform/core");
  const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(where);
  const name = flag("material");
  const mat = doc.getRoot().listMaterials().find((m) => m.getName() === name);
  if (!mat) throw new Error(`no material "${name}" — the file has: ${doc.getRoot().listMaterials().map((m) => m.getName()).join(", ")}`);
  color = mat.getBaseColorTexture()?.getImage();
  normal = mat.getNormalTexture()?.getImage();
  if (!color) throw new Error(`"${name}" has no base colour texture`);
  color = Buffer.from(color);
  if (normal) normal = Buffer.from(normal);
  const cj = join(dirname(where), basename(where, ".glb") + ".credit.json");
  if (existsSync(cj)) credit = JSON.parse(readFileSync(cj, "utf8"));
} else {
  const files = readdirSync(where);
  const pick = (re) => files.find((f) => re.test(f));
  const c = pick(/_Color\.jpg$/i) ?? pick(/_diff_\dk\.(jpg|png)$/i);
  const n = pick(/_NormalGL\.jpg$/i) ?? pick(/_nor_gl_\dk\.(jpg|png)$/i);
  if (!c) throw new Error(`no colour map in ${where}: ${files.join(", ")}`);
  color = readFileSync(join(where, c));
  normal = n ? readFileSync(join(where, n)) : null;
  if (existsSync(join(where, "credit.json"))) credit = JSON.parse(readFileSync(join(where, "credit.json"), "utf8"));
}

const outs = [await write(color, "color", 82)];
if (normal) outs.push(await write(normal, "normal", 88));
for (const o of outs) console.log(`wrote ${o.slice(ROOT.length + 1)}`);

const by = credit ? `"${credit.title}" by ${credit.author === credit.source ? credit.source : `${credit.author}, ${credit.source}`} (${credit.license.replace(" 1.0", "")})` : "UNKNOWN — say where it came from";
console.log(`\nsurfaces.ts (append to the right kind; set name, sizeM and roughness by eye):`);
console.log(`    { id: "${stem}", name: "…", file: "${stem}", sizeM: 2, ${normal ? "normal: true, " : ""}roughness: 0.8, credit: '${by}' },`);

if (args.includes("--move") && !where.endsWith(".glb") && where.startsWith(INBOX)) {
  const dest = join(DOWNLOADS, where.slice(INBOX.length + 1));
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(where, dest);
  console.log(`filed the download in ${dest.slice(ROOT.length + 1)}`);
}
