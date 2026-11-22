// SURVIVORZ EFFECTS — bakes the scorch marks (docs/survivorz/EFFECTS.md, step F3).
//
//   node scripts/survivorz/fx-scorch.mjs
//   -> assets/downloads/survivorz/fx/scorch/scorch-{color,normal}.{png,ktx2} + scorch.json
//
// The free Taproot scorch was judged and dropped: a soft, blurred starburst that reads
// as a smudge at any distance. These are made here instead, 2×2 cells at 512:
//   0, 1  BLAST — what a pipe bomb leaves: a burnt core, soot thrown out in streaks
//         that are long in some directions and short in others, grit flecks in a ring,
//         and a thin brown heat halo past the soot
//   2, 3  FUEL — what a molotov leaves: the charred shape of the spilled fuel (taken
//         from the outline of two of the ActionVFX pools, so it's a real spill's shape,
//         not a circle), blistered black inside, a brown heat edge round it
// Colour is straight alpha with the colour bled under the clear pixels; the normal is
// the soot's thickness, faint — char is a rough crust, not a heap.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const FX = path.join(ROOT, "assets", "downloads", "survivorz", "fx");
const OUT = path.join(FX, "scorch");
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";
const SIZE = 1024, CELL = 512;

// ---- noise -------------------------------------------------------------------------------
function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise2(seed) {
  const r = rngOf(seed), P = 256, g = Float32Array.from({ length: P * P }, r);
  const at = (x, y) => g[((y & (P - 1)) * P) + (x & (P - 1))];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
function fbm(n, x, y, oct = 5) {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let o = 0; o < oct; o++) { v += amp * n(x * f, y * f); sum += amp; amp *= 0.5; f *= 2.03; }
  return v / sum;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---- the cells ---------------------------------------------------------------------------
// each returns, per pixel, [soot coverage 0..1, heat 0..1 (brown halo), thickness 0..1]
function blast(seed) {
  const n = noise2(seed), n2 = noise2(seed + 7), na = noise2(seed + 13);
  return (u, v) => {
    const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y) / 0.47, th = Math.atan2(y, x);
    // how far the soot was thrown, by direction: broad lobes and fine streaks
    const ang = (th / (2 * Math.PI) + 0.5);
    const lobe = fbm(na, ang * 6, 3.3, 3), streak = fbm(na, ang * 70, 9.1, 3);
    const reach = 0.42 + 0.38 * lobe + 0.22 * Math.pow(streak, 1.6);
    const grain = fbm(n, u * 18, v * 18, 5);
    const base = 1 - smooth(reach * 0.15, reach, r);
    let soot = Math.pow(base, 0.6) * (0.55 + 0.65 * grain) * (0.75 + 0.35 * streak);
    // the core: burnt right through
    soot = Math.max(soot, 1 - smooth(0.1, 0.32 + 0.1 * grain, r));
    // flecks of grit thrown in a ring
    const fleck = fbm(n2, u * 60, v * 60, 2);
    if (fleck > 0.72 && r > 0.35 && r < reach * 1.25) soot = Math.max(soot, smooth(0.72, 0.8, fleck) * 0.85);
    const heat = (1 - smooth(reach * 0.8, reach * 1.2, r)) * (1 - smooth(0.2, 0.7, soot)) * 0.28;
    return [Math.min(1, soot), heat, Math.min(1, soot * (0.5 + grain))];
  };
}
function fuel(mask, seed) {
  // mask: a blurred spill outline, 0..1, CELL² (the ActionVFX pool's alpha)
  const n = noise2(seed), n2 = noise2(seed + 3);
  return (u, v) => {
    const X = Math.min(CELL - 1, Math.floor(u * CELL)), Y = Math.min(CELL - 1, Math.floor(v * CELL));
    const m = mask[Y * CELL + X];
    const grain = fbm(n, u * 22, v * 22, 5), blister = fbm(n2, u * 40, v * 40, 3), patch = fbm(n2, u * 4, v * 4, 3);
    // the edge of the burn wanders a little off the spill's
    const edge = m > 0.01 ? m + (grain - 0.5) * 0.4 : 0;
    // thin fuel burned off light, deep fuel left a crust: patchy, never an even stain
    let soot = smooth(0.12, 0.6, edge) * Math.min(1, 0.55 + 0.8 * patch + 0.3 * (grain - 0.5));
    soot = Math.min(1, soot + 0.25 * smooth(0.55, 0.75, blister) * smooth(0.12, 0.5, edge));
    // burning splashes thrown past the edge
    const splash = fbm(n, u * 48 + 7, v * 48, 2);
    if (m > 0.005 && m < 0.25 && splash > 0.7) soot = Math.max(soot, smooth(0.7, 0.78, splash) * 0.8);
    const heat = m > 0.005 ? smooth(0.02, 0.25, edge) * (1 - smooth(0.2, 0.55, edge)) * 0.35 : 0;
    return [soot, heat, soot * (0.4 + 0.8 * blister)];
  };
}

async function spillMask(cell) {
  // the pools atlas (fx-blood.mjs) cell's alpha, blurred so its edge is a gradient
  const pools = path.join(FX, "blood", "pools-color.png");
  const meta = JSON.parse(fs.readFileSync(path.join(FX, "blood", "blood.json"), "utf8")).pools;
  const c = meta.size / meta.cols;
  const { data } = await sharp(pools).extract({ left: (cell % meta.cols) * c, top: Math.floor(cell / meta.cols) * c, width: c, height: c })
    .resize(Math.round(CELL * 0.8), Math.round(CELL * 0.8)).extend({ top: Math.round(CELL * 0.1), bottom: CELL - Math.round(CELL * 0.8) - Math.round(CELL * 0.1), left: Math.round(CELL * 0.1), right: CELL - Math.round(CELL * 0.8) - Math.round(CELL * 0.1), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extractChannel(3).blur(6).raw().toBuffer({ resolveWithObject: true });
  // (shrunk to 80% of the cell: a pool that fills its cell gets its ends flattened by the clear border)
  return Float32Array.from(data, (x) => x / 255);
}

fs.mkdirSync(OUT, { recursive: true });
// (spills whose photo is not cut off by its frame: a cut edge chars as a straight line)
const cells = [blast(11), blast(29), fuel(await spillMask(0), 41), fuel(await spillMask(2), 53)];
const color = Buffer.alloc(SIZE * SIZE * 4), thick = new Float32Array(SIZE * SIZE);
for (const [i, f] of cells.entries()) {
  const ox = (i % 2) * CELL, oy = Math.floor(i / 2) * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    // a 3% clear border so mips never pull a neighbour in
    const u = x / CELL, v = y / CELL;
    const border = smooth(0, 0.03, Math.min(u, v, 1 - u, 1 - v));
    let [soot, heat, th] = f(u, v);
    soot *= border; heat *= border;
    // soot near black, a little warm; the heat halo a scorched brown; combined as two layers
    const sootRGB = [0.022, 0.019, 0.017], heatRGB = [0.2, 0.12, 0.07];
    const a = soot + heat * (1 - soot);
    const k = a > 0 ? soot / a : 1;
    const o = ((oy + y) * SIZE + ox + x) * 4;
    for (let ch = 0; ch < 3; ch++) {
      const lin = mix(heatRGB[ch], sootRGB[ch], k);
      color[o + ch] = Math.round(255 * (lin <= 0.0031308 ? lin * 12.92 : 1.055 * lin ** (1 / 2.4) - 0.055));
    }
    color[o + 3] = Math.round(255 * Math.min(1, a));
    thick[(oy + y) * SIZE + ox + x] = th * border;
  }
}
const png = path.join(OUT, "scorch-color.png");
await sharp(color, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(png);
// the normal at half size, faint
const NS = SIZE / 2, normal = Buffer.alloc(NS * NS * 4), k = 2.2;
const T = (x, y) => thick[Math.min(SIZE - 1, Math.max(0, y)) * SIZE + Math.min(SIZE - 1, Math.max(0, x))];
for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
  const dx = (T(2 * x + 2, 2 * y) - T(2 * x - 2, 2 * y)) * k, dy = (T(2 * x, 2 * y + 2) - T(2 * x, 2 * y - 2)) * k;
  const l = Math.hypot(dx, dy, 1), o = (y * NS + x) * 4;
  normal[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); normal[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
  normal[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); normal[o + 3] = 255;
}
const npng = path.join(OUT, "scorch-normal.png");
await sharp(normal, { raw: { width: NS, height: NS, channels: 4 } }).png().toFile(npng);
const files = {};
for (const [name, p, fmt, tf] of [["color", png, "R8G8B8A8_SRGB", "srgb"], ["normal", npng, "R8G8B8A8_UNORM", "linear"]]) {
  const k2 = p.replace(".png", ".ktx2");
  execFileSync(KTX, ["create", "--format", fmt, "--assign-tf", tf, "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--zstd", "18", "--generate-mipmap", p, k2], { stdio: ["ignore", "ignore", "inherit"] });
  files[name] = { png: path.basename(p), ktx2: path.basename(k2) };
}
fs.writeFileSync(path.join(OUT, "scorch.json"), JSON.stringify({ made: new Date().toISOString(), size: SIZE, cols: 2, rows: 2, ...files,
  cells: [{ cell: 0, kind: "blast" }, { cell: 1, kind: "blast" }, { cell: 2, kind: "fuel" }, { cell: 3, kind: "fuel" }],
  contract: "cell 0 top-left; colour sRGB straight alpha; normal linear (tangent space, +y up the cell)" }, null, 1));
for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(22), (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), "KB");
