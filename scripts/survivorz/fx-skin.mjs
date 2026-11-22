// SURVIVORZ EFFECTS — bakes each survivor's SKIN MASK (docs/survivorz/EFFECTS.md
// step F5): which parts of the body's one texture atlas are skin and which are
// clothes, so infection (pallor, veins), sweat and wounds land on skin and grime on
// everything.
//
//   node scripts/survivorz/fx-skin.mjs [name...]
//   -> assets/downloads/survivorz/fx/survivors/<name>-skin.png (512², R = skin)
//      + <name>-skin-preview.png (the texture with the mask over it, for checking)
//
// The survivors are full-body scans (Renderpeople): one mesh, one material, one
// texture, skin and clothes together. Skin is told apart by its COLOUR in the texture
// — a band of hue, saturation and brightness that skin of every tone falls inside and
// most fabric doesn't — and then cleaned: speckle removed, holes closed, the edge
// softened. Reviewed by eye on the preview; a survivor whose clothes are skin-coloured
// gets a hand-tuned band in TUNE.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const GAME = path.join(ROOT, "assets", "downloads", "survivorz", "game");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "survivors");
const CAST = ["carla", "claudia", "eric", "manuel", "nathan", "sophia", "rollo"];
const SIZE = 512;

// the skin band, per survivor where the default needs help: hue in degrees, saturation
// and value 0..1
const BAND = { hue: [2, 38], sat: [0.16, 0.68], val: [0.3, 0.98] };
// and regions to leave out by hand, as boxes on the atlas (0..1, image y down): brown hair
// and tan shoe linings sit inside the skin band, and no colour rule separates them
const TUNE = {
  sophia: { exclude: [[0, 0.62, 0.42, 1], [0.34, 0.22, 0.56, 0.4]] }, // her hair
  nathan: { exclude: [[0.7, 0.73, 0.86, 0.93]] }, // his shoes (not the hand beside them)
  // a hazmat suit, mask and black rubber gloves: none of him shows (the body inside is a hidden
  // proxy). His mask is empty on purpose, which the engine reads as `covered`
  // a hazmat suit, black rubber gloves and a respirator: only his face shows, through the visor,
  // painted into the suit's texture in three patches (one upside down) and washed out by the
  // glass. ONLY those patches, with a band loose enough for skin seen through glass
  // (all of it, the glass's grey included: the texture is blocky, and a colour test caught some
  // blocks and not their neighbours, leaving hard edges across his face when he turned)
  rollo: { only: [[0.749, 0.879, 0.797, 0.97], [0.875, 0.373, 0.9375, 0.438], [0.87, 0.5, 0.955, 0.585]], hue: [-10, 370], sat: [-1, 2], val: [0.15, 2], notPurple: true,
    // the painted eyes (the face is upside down in its patch): the lit one, and the one in the
    // brow's shadow at the patch's edge. The turn clouds THESE, not the hidden body's
    eyes: [[0.7795, 0.9335], [0.7495, 0.937]] },
};

function textureOf(name) {
  const b = fs.readFileSync(path.join(GAME, `${name}.glb`));
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + len).toString());
  // the material with a texture: Rollo's first is his untextured gloves
  const mat = j.materials.find((m) => m.pbrMetallicRoughness?.baseColorTexture) ?? j.materials[0];
  const tex = j.textures[mat.pbrMetallicRoughness.baseColorTexture.index];
  const bv = j.bufferViews[j.images[tex.source].bufferView];
  const bin = 20 + len + 8;
  return b.subarray(bin + (bv.byteOffset ?? 0), bin + (bv.byteOffset ?? 0) + bv.byteLength);
}

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}

async function bake(name) {
  const band = { ...BAND, ...(TUNE[name] ?? {}) };
  const exclude = TUNE[name]?.exclude ?? [];
  const src = textureOf(name);
  const { data } = await sharp(src).resize(SIZE, SIZE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const [h, s, v] = hsv(data[i * 3] / 255, data[i * 3 + 1] / 255, data[i * 3 + 2] / 255);
    // soft at the edges of the band, so the mask has no hard colour cut
    const inH = Math.min(1, Math.max(0, Math.min(h - band.hue[0], band.hue[1] - h) / 4));
    const inS = Math.min(1, Math.max(0, Math.min(s - band.sat[0], band.sat[1] - s) / 0.05));
    const inV = Math.min(1, Math.max(0, Math.min(v - band.val[0], band.val[1] - v) / 0.05));
    const u = (i % SIZE) / SIZE, v2 = Math.floor(i / SIZE) / SIZE;
    const out = exclude.some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v2 >= y0 && v2 <= y1);
    const only = TUNE[name]?.only;
    const inside = !only || only.some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v2 >= y0 && v2 <= y1);
    // (the suit's purple, inside a box drawn round a face)
    const purple = TUNE[name]?.notPurple && h > 230 && h < 330 && s > 0.2;
    m[i] = out || !inside || purple ? 0 : inH * inS * inV;
  }
  // clean it: a median-ish open/close with box filters, then a soft edge
  const box = (a, r) => {
    const o = new Float32Array(a.length);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= SIZE || Y >= SIZE) continue;
        s += a[Y * SIZE + X]; n++;
      }
      o[y * SIZE + x] = s / n;
    }
    return o;
  };
  let c = box(m, 2).map((v) => (v > 0.55 ? 1 : 0)); // speckle out
  c = box(c, 3).map((v) => (v > 0.3 ? 1 : 0)); // holes closed
  c = box(c, 2); // a soft edge
  fs.mkdirSync(OUT, { recursive: true });
  const mask = Buffer.from(c.map((v) => Math.round(v * 255)));
  await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png().toFile(path.join(OUT, `${name}-skin.png`));
  // the same mask as JSON for the engine: it goes into the body overlay's blue channel on the
  // CPU (and the checks run with no canvas), so it's read as data, not as a texture
  fs.writeFileSync(path.join(OUT, `${name}-skin.json`), JSON.stringify({ size: SIZE, data: mask.toString("base64"), ...(TUNE[name]?.eyes ? { eyes: TUNE[name].eyes } : {}) }));
  // the preview: the texture, darkened, with the skin in magenta
  const prev = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const k = c[i];
    prev[i * 3] = Math.round(data[i * 3] * 0.45 * (1 - k) + 255 * k * 0.85 + data[i * 3] * 0.15 * k);
    prev[i * 3 + 1] = Math.round(data[i * 3 + 1] * 0.45 * (1 - k) + data[i * 3 + 1] * 0.25 * k);
    prev[i * 3 + 2] = Math.round(data[i * 3 + 2] * 0.45 * (1 - k) + 255 * k * 0.75);
  }
  await sharp(prev, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toFile(path.join(OUT, `${name}-skin-preview.png`));
  const share = c.reduce((a, b) => a + b, 0) / c.length;
  console.log(`${name}: ${(share * 100).toFixed(1)}% of the atlas is skin`);
}

for (const n of process.argv.slice(2).length ? process.argv.slice(2) : CAST) await bake(n);
