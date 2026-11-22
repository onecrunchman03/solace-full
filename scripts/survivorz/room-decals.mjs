// SURVIVORZ: the grime decals a dressed room lays over its shell (the look test's "grime").
//
//   node scripts/survivorz/room-decals.mjs       (after room-build.py has extracted the ambientCG sets)
//   → assets/downloads/survivorz/rooms/vault-lobby/decals/<name>.webp
//
// The ambientCG stain sets are opaque: white with the stain drawn on it. A decal wants the stain
// ALONE, so each becomes a dark grime colour with the stain as its alpha (white = clear). Signs and
// tape stay opaque (they're things stuck on, not dirt). The room's layout says where each goes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEX = path.join(ROOT, "assets", "downloads", "survivorz", "rooms", "tex");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "rooms", "vault-lobby", "decals");
fs.mkdirSync(OUT, { recursive: true });
const colorOf = (set) => path.join(TEX, set, `${set}_2K-JPG_Color.jpg`);
const ensure = (set) => {
  if (fs.existsSync(colorOf(set))) return;
  const zip = path.join(ROOT, "assets", "downloads", "survivorz", "free", "ambientcg", `${set}_2K-JPG.zip`);
  fs.mkdirSync(path.join(TEX, set), { recursive: true });
  const { execFileSync } = await_import();
  execFileSync("unzip", ["-o", "-q", zip, "-d", path.join(TEX, set)]);
};
function await_import() { return { execFileSync: (...a) => import("node:child_process").then((m) => m.execFileSync(...a)) }; }

/** a stain as alpha: alpha = ((1 - luminance) - floor) / (1 - floor), raised to `gamma`, times `strength` */
async function stain(set, name, { rgb = [34, 28, 22], strength = 0.85, floor = 0.12, gamma = 1.1, size = 1024, invert = false } = {}) {
  const { execFileSync } = await import("node:child_process");
  if (!fs.existsSync(colorOf(set))) {
    const zip = path.join(ROOT, "assets", "downloads", "survivorz", "free", "ambientcg", `${set}_2K-JPG.zip`);
    fs.mkdirSync(path.join(TEX, set), { recursive: true });
    execFileSync("unzip", ["-o", "-q", zip, "-d", path.join(TEX, set)]);
  }
  const { data, info } = await sharp(colorOf(set)).resize(size, size).greyscale().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    let l = data[i] / 255; if (invert) l = 1 - l;
    let a = Math.max(0, ((1 - l) - floor) / (1 - floor));
    a = Math.pow(a, gamma) * strength;
    px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = Math.round(Math.min(1, a) * 255);
  }
  await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(OUT, `${name}.webp`));
  console.log("decal", name);
}
async function plate(set, name, size = 512) {
  const { execFileSync } = await import("node:child_process");
  if (!fs.existsSync(colorOf(set))) {
    const zip = path.join(ROOT, "assets", "downloads", "survivorz", "free", "ambientcg", `${set}_2K-JPG.zip`);
    fs.mkdirSync(path.join(TEX, set), { recursive: true });
    execFileSync("unzip", ["-o", "-q", zip, "-d", path.join(TEX, set)]);
  }
  await sharp(colorOf(set)).resize(size, size).webp({ quality: 90 }).toFile(path.join(OUT, `${name}.webp`));
  console.log("plate", name);
}

/** WATER DAMAGE, drawn: the ambientCG "Leaking" sets are wet-surface overlays (shine and drip
 *  height), not stains, so the streaks are made here. A blotchy band where the water came in under
 *  the ceiling, rust-brown runs fading down the wall, everything seeded so a rebuild is the same. */
async function leak(name, seed, { w = 512, h = 1024, runs = 26, rgb = [72, 52, 32] } = {}) {
  let st = seed >>> 0;
  const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // smooth value noise, two octaves
  const G = 32, grid = Array.from({ length: (G + 1) * (G + 1) }, rnd), sm = (x) => x * x * (3 - 2 * x);
  const noise = (x, y) => { const gx = x * G, gy = y * G, i = Math.min(G - 1, Math.floor(gx)), j = Math.min(G - 1, Math.floor(gy)), fx = sm(gx - i), fy = sm(gy - j);
    const at = (a, b) => grid[(j + b) * (G + 1) + (i + a)]; return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy; };
  const fbm = (x, y) => 0.65 * noise(x, y) + 0.35 * noise((x * 2.7) % 1, (y * 2.7) % 1);
  const streaks = Array.from({ length: runs }, () => ({ x: 0.08 + rnd() * 0.84, wd: 0.004 + rnd() * 0.018, len: 0.18 + Math.pow(rnd(), 0.7) * 0.75, a: 0.35 + rnd() * 0.5, wob: rnd() * 6.28 }));
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // the band: thick at the top, a ragged lower edge
      const edge = 0.08 + 0.1 * fbm(u * 0.9, 0.1);
      let a = v < edge ? 0.85 * (0.6 + 0.4 * fbm(u, v * 3)) : Math.max(0, 0.85 - (v - edge) * 9) * fbm(u, v);
      for (const s of streaks) {
        if (v > s.len) continue;
        const cx = s.x + 0.006 * Math.sin(v * 22 + s.wob);
        const d = Math.abs(u - cx) / s.wd;
        if (d > 1.5) continue;
        const fall = Math.pow(1 - v / s.len, 0.8);
        a = Math.max(a, s.a * fall * Math.exp(-d * d * 1.6) * (0.75 + 0.25 * noise(u * 4 % 1, v * 8 % 1)));
      }
      // a soft fade at the sides so the decal has no edge
      a *= Math.min(1, u / 0.08, (1 - u) / 0.08);
      const i = (y * w + x) * 4;
      const tone = 0.8 + 0.4 * fbm(u * 2 % 1, v * 2 % 1);
      px[i] = Math.min(255, rgb[0] * tone); px[i + 1] = Math.min(255, rgb[1] * tone); px[i + 2] = Math.min(255, rgb[2] * tone); px[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  await sharp(px, { raw: { width: w, height: h, channels: 4 } }).blur(0.8).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(OUT, `${name}.webp`));
  console.log("decal", name);
}
/** a grunge set's own opacity (or a map used as one) as a dark decal */
async function grunge(set, map, name, { rgb = [26, 22, 18], strength = 0.6, gamma = 1.2, invert = false, size = 1024 } = {}) {
  const { execFileSync } = await import("node:child_process");
  if (!fs.existsSync(colorOf(set))) {
    const zip = path.join(ROOT, "assets", "downloads", "survivorz", "free", "ambientcg", `${set}_2K-JPG.zip`);
    fs.mkdirSync(path.join(TEX, set), { recursive: true });
    execFileSync("unzip", ["-o", "-q", zip, "-d", path.join(TEX, set)]);
  }
  const { data, info } = await sharp(path.join(TEX, set, `${set}_2K-JPG_${map}.jpg`)).resize(size, size).greyscale().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    let l = data[i] / 255; if (invert) l = 1 - l;
    const a = Math.pow(l, gamma) * strength;
    px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = Math.round(Math.min(1, a) * 255);
  }
  await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(OUT, `${name}.webp`));
  console.log("decal", name);
}

/** DIRT BANKED AT A WALL'S FOOT: mop water, shoe scuffs and dust, dark at the floor and fading up
 *  raggedly. Tiles across (the noise wraps in u), so one 2 m texture repeats down a 15 m wall. */
async function dirtBand(name, seed, { w = 1024, h = 256, rgb = [40, 33, 26] } = {}) {
  let st = seed >>> 0;
  const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sm = (x) => x * x * (3 - 2 * x);
  const octave = (G) => {
    const grid = Array.from({ length: G * (G + 1) }, rnd);   // G columns that wrap, G+1 rows
    return (x, y) => { const gx = x * G, gy = y * G, i = Math.floor(gx) % G, j = Math.min(G - 1, Math.floor(gy)), fx = sm(gx - Math.floor(gx)), fy = sm(gy - j);
      const at = (a, b) => grid[(j + b) * G + ((i + a) % G)]; return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy; };
  };
  const n1 = octave(8), n2 = octave(24), n3 = octave(64);
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / h;                              // 0 at the top of the band, 1 at the floor
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const reach = 0.25 + 0.55 * n1(u, 0.3);       // how far up the dirt climbs here
      const up = 1 - v;                             // 0 at the floor
      let a = Math.max(0, 1 - up / reach);
      a = Math.pow(a, 1.6) * (0.55 + 0.45 * n2(u, v)) + 0.18 * Math.max(0, n3(u, v) - 0.55) * (1 - up);
      a *= 0.9;
      const i = (y * w + x) * 4, tone = 0.8 + 0.4 * n2(u, (v * 0.5) % 1);
      px[i] = Math.min(255, rgb[0] * tone); px[i + 1] = Math.min(255, rgb[1] * tone); px[i + 2] = Math.min(255, rgb[2] * tone); px[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  await sharp(px, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(OUT, `${name}.webp`));
  console.log("decal", name);
}

await dirtBand("dirt-band", 5);
await leak("leak-a", 11);
await leak("leak-b", 23, { runs: 18 });
await leak("leak-c", 37, { runs: 34, rgb: [60, 48, 34] });
await grunge("SurfaceImperfections015", "Opacity", "grime-floor", { strength: 0.6, gamma: 1.3 });
await grunge("Smear002", "Roughness", "smear", { strength: 0.75, gamma: 1.6, rgb: [30, 24, 20] });
await plate("Sign004", "sign-biohazard");
await plate("Tape001", "tape-hazard", 512);
