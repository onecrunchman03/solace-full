// SURVIVORZ EFFECTS — bakes blood running down a wall (docs/survivorz/EFFECTS.md, F2's runs).
//
//   node scripts/survivorz/fx-runs.mjs
//   -> assets/downloads/survivorz/fx/blood/runs-{color,normal,spread}.{png,ktx2} + runs.json
//
// The ActionVFX photographs are all blood lying on a floor: none runs. So the runs are made
// here, small (the effects had 3 MB of memory left): four tall cells, each a soaked band at the
// top — where the spatter hit — with three to six rivulets hanging from it. Each rivulet wanders
// a little as it goes down, thins, and ends in a bead where the blood gathers. The SPREAD map
// (the pools' trick) counts down each rivulet from the band, every one at its own pace, so a
// run CRAWLS down the wall over several seconds instead of appearing whole; the shader shows a
// pixel once the mark's grow clock passes its spread value.
//
// Colour 1024×512 (four cells, 256 wide by 512 tall; the top of a cell is up the wall), the
// normal from the blood's thickness at half size, the spread at quarter size.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "blood");
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";
const CW = 256, CH = 512, COLS = 4, W = CW * COLS, H = CH;

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
function noise1(seed) {
  const r = rngOf(seed), g = Float32Array.from({ length: 512 }, r);
  return (x) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return g[i & 511] + (g[(i + 1) & 511] - g[i & 511]) * s; };
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
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** one cell: thickness and spread per pixel (x across 0..CW, y DOWN 0..CH) */
function cell(seed) {
  const rng = rngOf(seed), n = noise2(seed + 1);
  const bandBottom = CH * (0.08 + rng() * 0.04);
  const count = 3 + Math.floor(rng() * 4);
  const streams = Array.from({ length: count }, (_, i) => {
    const x0 = CW * (0.18 + (0.64 * (i + 0.2 + rng() * 0.6)) / count);
    const len = CH * (0.3 + rng() * 0.52);
    return {
      x0, y0: CH * 0.04 + bandBottom * (0.4 + rng() * 0.5), y1: bandBottom + len,
      w: 2.2 + rng() * 3.2, wob: noise1(seed * 7 + i), amp: 3 + rng() * 6, freq: 0.006 + rng() * 0.01,
      // its pace: the slow ones finish late, so the front is ragged
      pace: 0.55 + rng() * 0.45, bead: 1.5 + rng() * 0.7,
    };
  });
  const thick = new Float32Array(CW * CH), spread = new Float32Array(CW * CH).fill(1);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    let t = 0, s = 1;
    // where it hit: a soaked blob at the head of each run, ragged, no straight edge anywhere
    for (const st of streams) {
      const r = st.w * (1.6 + 1.2 * n(st.x0 * 0.1, 3)) * (0.6 + 0.9 * n(x * 0.06, y * 0.06));
      const d = Math.hypot((x - st.x0) * 0.8, (y - st.y0 * 0.9) * 1.25);
      const kb = (1 - smooth(r * 0.3, r, d)) * (0.3 + 0.35 * n(x * 0.09, y * 0.09));
      if (kb > t) { t = kb; s = 0.02 * n(x * 0.1, y * 0.1); }
    }
    for (const st of streams) {
      if (y < st.y0 - 8 || y > st.y1 + st.w * st.bead * 2) continue;
      const along = clamp((y - st.y0) / (st.y1 - st.y0));
      const cx = st.x0 + (st.wob(y * st.freq) - 0.5) * st.amp * 2 * along;
      const width = st.w * (1 - 0.45 * along);
      const d = Math.abs(x - cx);
      let k = 1 - smooth(width * 0.55, width, d);
      if (y > st.y1) k = 0;
      // the bead at its end
      const bd = Math.hypot(x - cx, (y - st.y1) * 0.8);
      const bw = st.w * st.bead;
      const kb = 1 - smooth(bw * 0.6, bw, bd);
      const kk = Math.max(k * (0.55 + 0.25 * (1 - along)), kb * 0.95);
      if (kk > t) {
        t = kk;
        s = Math.min(s, 0.04 + (Math.max(0, y - st.y0) / (st.y1 - st.y0 + bw)) * 0.9 / st.pace * 0.92);
      } else if (kk > 0.02) s = Math.min(s, 0.04 + (Math.max(0, y - st.y0) / (st.y1 - st.y0 + bw)) * 0.9 / st.pace * 0.92);
    }
    thick[y * CW + x] = t;
    spread[y * CW + x] = clamp(s);
  }
  return { thick, spread };
}

fs.mkdirSync(OUT, { recursive: true });
const color = Buffer.alloc(W * H * 4), T = new Float32Array(W * H), S = new Float32Array(W * H);
const srgb = (lin) => Math.round(255 * clamp(lin <= 0.0031308 ? lin * 12.92 : 1.055 * lin ** (1 / 2.4) - 0.055));
for (let c = 0; c < COLS; c++) {
  const { thick, spread } = cell(500 + c * 31);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const t = thick[y * CW + x], k = y * W + c * CW + x;
    // thin blood is a brighter red, thick darker (the photographs' own tone, fresh and well lit)
    const red = 0.34 - 0.24 * smooth(0.2, 0.9, t);
    color[k * 4] = srgb(red); color[k * 4 + 1] = srgb(red * 0.05); color[k * 4 + 2] = srgb(red * 0.045);
    color[k * 4 + 3] = Math.round(255 * clamp(smooth(0.02, 0.3, t)));
    T[k] = t;
    S[k] = spread[y * CW + x];
  }
}
const cpng = path.join(OUT, "runs-color.png");
await sharp(color, { raw: { width: W, height: H, channels: 4 } }).png().toFile(cpng);
const NW = W / 2, NH = H / 2, normal = Buffer.alloc(NW * NH * 4), K = 5;
const TT = (x, y) => T[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
  const dx = (TT(2 * x + 2, 2 * y) - TT(2 * x - 2, 2 * y)) * K, dy = (TT(2 * x, 2 * y + 2) - TT(2 * x, 2 * y - 2)) * K;
  const l = Math.hypot(dx, dy, 1), o = (y * NW + x) * 4;
  normal[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); normal[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
  normal[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); normal[o + 3] = 255;
}
const npng = path.join(OUT, "runs-normal.png");
await sharp(normal, { raw: { width: NW, height: NH, channels: 4 } }).png().toFile(npng);
// the spread at quarter size: the smallest value in each 4×4 block, so a thin stream isn't lost
const SW = W / 4, SH = H / 4, sp = Buffer.alloc(SW * SH * 4);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  let m = 1;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) m = Math.min(m, S[(y * 4 + j) * W + x * 4 + i]);
  const v = Math.round(m * 255), o = (y * SW + x) * 4;
  sp[o] = v; sp[o + 1] = v; sp[o + 2] = v; sp[o + 3] = 255;
}
const spng = path.join(OUT, "runs-spread.png");
await sharp(sp, { raw: { width: SW, height: SH, channels: 4 } }).png().toFile(spng);
// the review sheet: each cell at four moments of its crawl, on a wall grey
{
  const frames = [0.15, 0.4, 0.7, 1.08], PW = W, PH = H, sheet = Buffer.alloc(PW * frames.length * PH * 3);
  for (const [fi, g] of frames.entries()) for (let y = 0; y < PH; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, a = color[k * 4 + 3] / 255 * (1 - smooth(g - 0.05, g + 0.01, S[k]));
    const o = (y * PW * frames.length + fi * PW + x) * 3;
    const bg = 120;
    for (let ch = 0; ch < 3; ch++) sheet[o + ch] = Math.round(bg + (color[k * 4 + ch] - bg) * a);
  }
  await sharp(sheet, { raw: { width: PW * frames.length, height: PH, channels: 3 } }).resize(1600, 200).png().toFile(path.join(OUT, "runs-preview.png"));
}
const files = {};
for (const [name, p, fmt, tf] of [["color", cpng, "R8G8B8A8_SRGB", "srgb"], ["normal", npng, "R8G8B8A8_UNORM", "linear"], ["spread", spng, "R8G8B8A8_UNORM", "linear"]]) {
  const k2 = p.replace(".png", ".ktx2");
  execFileSync(KTX, ["create", "--format", fmt, "--assign-tf", tf, "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--zstd", "18", "--generate-mipmap", p, k2], { stdio: ["ignore", "ignore", "inherit"] });
  files[name] = { png: path.basename(p), ktx2: path.basename(k2) };
}
fs.writeFileSync(path.join(OUT, "runs.json"), JSON.stringify({
  made: new Date().toISOString(), width: W, height: H, cols: COLS, rows: 1, aspect: CH / CW, ...files,
  contract: "four cells across, each 256 wide by 512 tall, the top of a cell UP the wall (the soaked band where the blood hit); colour sRGB straight alpha; normal linear OpenGL; spread R linear, 0 shows first",
}, null, 1));
for (const f of fs.readdirSync(OUT).filter((f) => f.startsWith("runs"))) console.log(f.padEnd(22), (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), "KB");
