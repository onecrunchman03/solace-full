// SURVIVORZ: the room's own surface sets, made from CC0 scans by grading them (2026-10-26, the staff
// security hall). room-build.py reads them as "own:<name>" from assets/downloads/survivorz/rooms/tex/own/.
//
//   hall-porcelain   the hall's floor: ambientCG Concrete031 (polished concrete in 1.2 m slabs) lifted to
//                    a light cool grey, about #8E9194 (the references' large-format porcelain), its
//                    stains quietened, and polished (roughness down to about 0.35)
//
//   node scripts/survivorz/room-surfaces.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEX = path.join(ROOT, "assets/downloads/survivorz/rooms/tex");
const OWN = path.join(TEX, "own");

// grade: out = mean target + (in - in mean) * contrast, per channel
async function grade(src, dst, target, contrast) {
  const st = await sharp(src).stats();
  const means = st.channels.slice(0, 3).map((c) => c.mean);
  const lin = { a: means.map(() => contrast), b: means.map((m, i) => target[i] - m * contrast) };
  await sharp(src).removeAlpha().linear(lin.a, lin.b).jpeg({ quality: 92 }).toFile(dst);
}

const sets = {
  "hall-porcelain": async (out) => {
    const d = path.join(TEX, "Concrete031");
    await grade(path.join(d, "Concrete031_2K-JPG_Color.jpg"), path.join(out, "color.jpg"), [142, 145, 148], 0.7);
    await grade(path.join(d, "Concrete031_2K-JPG_Roughness.jpg"), path.join(out, "rough.jpg"), [92, 92, 92], 0.6);
    fs.copyFileSync(path.join(d, "Concrete031_2K-JPG_NormalGL.jpg"), path.join(out, "normal.jpg"));
  },
  "decon-floor": async (out) => {
    // the decon entry's floor: Poly Haven's rubber tiles lifted from near-black to a light cleanroom grey
    // (references 10: light, seamless, coved at the walls), still rubber, a little sheen
    const d = path.join(ROOT, "assets/downloads/survivorz/free/polyhaven/rubber_tiles");
    await grade(path.join(d, "rubber_tiles_diff_2k.jpg"), path.join(out, "color.jpg"), [138, 142, 146], 0.55);
    await grade(path.join(d, "rubber_tiles_rough_2k.jpg"), path.join(out, "rough.jpg"), [140, 140, 140], 0.7);
    fs.copyFileSync(path.join(d, "rubber_tiles_nor_gl_2k.jpg"), path.join(out, "normal.jpg"));
  },
  // THE RESIDENTIAL WING (2026-10-27): the back of house wore raw Poly Haven scans and read as a
  // dirty brown basement. Graded to the references instead (R14-R18: a grey epoxy floor, off-white
  // painted block, plain grey plate steel in the panic room, a flat teal acoustic panel in the rec room)
  "shelter-floor": async (out) => {
    // grey epoxy over concrete: worn concrete, cooled and lifted, its scuffs kept faint
    const d = path.join(ROOT, "assets/downloads/survivorz/free/polyhaven/concrete_floor_worn_001");
    await grade(path.join(d, "concrete_floor_worn_001_diff_2k.jpg"), path.join(out, "color.jpg"), [118, 122, 124], 0.45);
    await grade(path.join(d, "concrete_floor_worn_001_rough_2k.jpg"), path.join(out, "rough.jpg"), [120, 120, 120], 0.6);
    fs.copyFileSync(path.join(d, "concrete_floor_worn_001_nor_gl_2k.jpg"), path.join(out, "normal.jpg"));
  },
  "shelter-wall": async (out) => {
    // painted block: the painted concrete lifted to an institutional off-white, its texture kept as a whisper
    const d = path.join(ROOT, "assets/downloads/survivorz/free/polyhaven/painted_concrete_02");
    await grade(path.join(d, "painted_concrete_02_diff_2k.jpg"), path.join(out, "color.jpg"), [186, 188, 182], 0.35);
    await grade(path.join(d, "painted_concrete_02_rough_2k.jpg"), path.join(out, "rough.jpg"), [170, 170, 170], 0.5);
    fs.copyFileSync(path.join(d, "painted_concrete_02_nor_gl_2k.jpg"), path.join(out, "normal.jpg"));
  },
  "steel-plate": async (out) => {
    // the panic room's lining: Poly Haven's riveted blue plate, its paint taken out to a dull grey steel
    const d = path.join(ROOT, "assets/downloads/survivorz/free/polyhaven/blue_metal_plate");
    await sharp(path.join(d, "blue_metal_plate_diff_2k.jpg")).grayscale().toColourspace("srgb").toFile(path.join(out, "gray.png"));
    await grade(path.join(out, "gray.png"), path.join(out, "color.jpg"), [112, 115, 118], 0.8);
    fs.rmSync(path.join(out, "gray.png"));
    await grade(path.join(d, "blue_metal_plate_rough_2k.jpg"), path.join(out, "rough.jpg"), [110, 110, 110], 0.8);
    fs.copyFileSync(path.join(d, "blue_metal_plate_nor_gl_2k.jpg"), path.join(out, "normal.jpg"));
  },
  "accent-panel": async (out) => {
    // the rec room's teal acoustic panel: the white composite's grain flattened almost away, coloured
    // in the texture rather than tinted (a tint over the white's mottle read as damp)
    const d = path.join(TEX, "Plastic013A");
    await grade(path.join(d, "Plastic013A_2K-JPG_Color.jpg"), path.join(out, "color.jpg"), [74, 128, 130], 0.12);
    await grade(path.join(d, "Plastic013A_2K-JPG_Roughness.jpg"), path.join(out, "rough.jpg"), [190, 190, 190], 0.3);
    fs.copyFileSync(path.join(d, "Plastic013A_2K-JPG_NormalGL.jpg"), path.join(out, "normal.jpg"));
  },
  // THE RESEARCH LABS (2026-10-27, REFERENCES.md round seven: L5's resin floor and epoxy-painted walls, L11's
  // material per zone)
  "lab-floor": async (out) => {
    // seamless white resin: worn concrete taken almost to white and almost to nothing, polished
    const d = path.join(ROOT, "assets/downloads/survivorz/free/polyhaven/concrete_floor_worn_001");
    await grade(path.join(d, "concrete_floor_worn_001_diff_2k.jpg"), path.join(out, "color.jpg"), [178, 181, 182], 0.16);
    await grade(path.join(d, "concrete_floor_worn_001_rough_2k.jpg"), path.join(out, "rough.jpg"), [70, 70, 70], 0.4);
    fs.copyFileSync(path.join(d, "concrete_floor_worn_001_nor_gl_2k.jpg"), path.join(out, "normal.jpg"));
  },
  "lab-wall": async (out) => {
    // epoxy-painted block, white and satin
    const d = path.join(ROOT, "assets/downloads/survivorz/free/polyhaven/painted_concrete_02");
    await grade(path.join(d, "painted_concrete_02_diff_2k.jpg"), path.join(out, "color.jpg"), [204, 206, 205], 0.18);
    await grade(path.join(d, "painted_concrete_02_rough_2k.jpg"), path.join(out, "rough.jpg"), [120, 120, 120], 0.4);
    fs.copyFileSync(path.join(d, "painted_concrete_02_nor_gl_2k.jpg"), path.join(out, "normal.jpg"));
  },
  "vinyl-oak": async (out) => {
    // the break room's oak-look vinyl: Poly Haven's dark wood lifted to a pale oak
    const d = path.join(ROOT, "assets/downloads/survivorz/free/polyhaven/dark_wood");
    await grade(path.join(d, "dark_wood_diff_2k.jpg"), path.join(out, "color.jpg"), [150, 116, 82], 0.6);
    await grade(path.join(d, "dark_wood_rough_2k.jpg"), path.join(out, "rough.jpg"), [130, 130, 130], 0.5);
    fs.copyFileSync(path.join(d, "dark_wood_nor_gl_2k.jpg"), path.join(out, "normal.jpg"));
  },
  "raised-floor": async (out) => {
    // the server room's 600 mm access-floor tiles: ambientCG's white tile grid greyed (the set's repeat makes the 600)
    const d = path.join(TEX, "Tiles107");
    const f = (k) => path.join(d, fs.readdirSync(d).find((n) => n.endsWith(k)));
    await grade(f("_Color.jpg"), path.join(out, "color.jpg"), [128, 131, 134], 0.7);
    await grade(f("_Roughness.jpg"), path.join(out, "rough.jpg"), [150, 150, 150], 0.6);
    fs.copyFileSync(f("_NormalGL.jpg"), path.join(out, "normal.jpg"));
  },
};

for (const [name, make] of Object.entries(sets)) {
  const out = path.join(OWN, name);
  fs.mkdirSync(out, { recursive: true });
  await make(out);
  console.log("made", name);
}
