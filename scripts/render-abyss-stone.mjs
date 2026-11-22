// THE STONE OF THE ABYSS — its art, rendered by arithmetic (Josh, Sep 2026:
// "a dark stone that looks like its made of the same material as a black
// hole and has a glowing purple center"). No browser, no native module: a
// per-pixel shader in plain JS, supersampled, written out as a PNG through
// zlib. Deterministic, so the committed file regenerates byte-identical.
//
//   node scripts/render-abyss-stone.mjs            → assets/emoji/abyss/stone.png
//                                                    (+ emoji/abyss/stone.png when that dir exists)
//
// The picture, inside out: a violet-white core, a thin photon ring, the
// horizon's dark band, then a tilted accretion disc whose back half hides
// behind the horizon, all of it set INTO a rough black stone whose surface
// carries faint lensed arcs and three cracks the core light leaks through.
// A soft violet halo sits outside the silhouette so it reads on the dark
// inventory grid.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 512;
const SS = 2; // supersample factor
const W = SIZE * SS;

// ---- value noise (hashed lattice, smooth interpolation) --------------------
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t) => t * t * (3 - 2 * t);
const vnoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smooth(x - xi), ty = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
};
const fbm = (x, y, oct = 4) => {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2.1; }
  return v;
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));

// ---- the stone's outline: a rough rounded rock ------------------------------
const outline = (th) =>
  0.78 + 0.05 * Math.sin(3 * th + 0.7) + 0.035 * Math.sin(5 * th + 2.1) + 0.025 * Math.sin(8 * th + 4.0) + 0.022 * Math.sin(13 * th + 1.3) + 0.012 * Math.sin(23 * th + 2.6);

// The accretion disc: an ellipse tilted about the centre.
const DISC_ROT = -0.42; // radians
const DISC_A = 0.46;
const DISC_B = 0.15;
const CRACKS = [0.35, 2.4, 4.3]; // angles the light leaks along

function shade(u, v) {
  // u, v ∈ [-1, 1], y up
  const r = Math.hypot(u, v);
  const th = Math.atan2(v, u);
  const R = outline(th);
  const inside = sstep(R + 0.004, R - 0.004, r); // 1 inside the stone

  // ---- the rock ----
  const n = fbm(u * 5.5 + 3.1, v * 5.5 + 7.7, 5);
  const grain = fbm(u * 22 + 1, v * 22 + 2, 3);
  const nz = Math.sqrt(Math.max(0, 1 - (r / R) * (r / R)));
  const light = clamp01(-u * 0.55 + v * 0.7 + nz * 0.45); // key light top-left
  const facet = Math.pow(clamp01(n * 1.6 - 0.35), 1.6); // hard, glassy facets
  let cr = 4 + 14 * facet + 5 * grain + 10 * light;
  let cg = 3 + 9 * facet + 3 * grain + 7 * light;
  let cb = 9 + 26 * facet + 8 * grain + 16 * light;
  // limb: a violet Fresnel edge
  const rim = Math.pow(clamp01(r / R), 14);
  cr += 38 * rim; cg += 14 * rim; cb += 78 * rim;
  // lensed arcs across the surface — faint light bent round the core
  let arcs = 0;
  for (let i = 0; i < 4; i++) {
    const ri = 0.36 + i * 0.09 + 0.02 * Math.sin(th * 3 + i);
    arcs += gauss(r - ri, 0.012) * (0.35 + 0.65 * Math.max(0, Math.sin(th * (2 + i) + i * 1.7)));
  }
  arcs *= 0.16;
  cr += 90 * arcs; cg += 40 * arcs; cb += 170 * arcs;
  // cracks the core light leaks along
  let crack = 0;
  for (const a of CRACKS) {
    let d = Math.abs(((th - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    d += 0.06 * (fbm(r * 6 + a, th * 2, 3) - 0.5); // jitter the line
    crack += gauss(d, 0.028) * Math.exp(-Math.max(0, r - 0.28) / 0.22);
  }
  crack = Math.min(1, crack);
  cr += 120 * crack; cg += 50 * crack; cb += 210 * crack;

  // ---- the glow leaking out of the horizon into the rock ----
  const leak = Math.exp(-Math.max(0, r - 0.30) / 0.09) * 0.6;
  cr += 130 * leak; cg += 45 * leak; cb += 215 * leak;

  // ---- the horizon: a dark band, then the photon ring, then the core ----
  const band = sstep(0.31, 0.27, r) * sstep(0.19, 0.215, r); // 1 in [0.215, 0.27]
  cr *= 1 - 0.97 * band; cg *= 1 - 0.97 * band; cb *= 1 - 0.93 * band;
  const ring = gauss(r - 0.205, 0.009) * 1.0 + gauss(r - 0.205, 0.03) * 0.35;
  const core = sstep(0.2, 0.0, r);
  const coreHot = sstep(0.14, 0.0, r);
  // core: violet, white-hot at the centre
  const coreR = 150 + 100 * coreHot, coreG = 60 + 150 * coreHot, coreB = 255;
  cr = cr * (1 - core) + coreR * core;
  cg = cg * (1 - core) + coreG * core;
  cb = cb * (1 - core) + coreB * core;
  cr += 235 * ring; cg += 175 * ring; cb += 255 * ring;

  // ---- the accretion disc (tilted ellipse), Doppler-bright on the left ----
  const cs = Math.cos(DISC_ROT), sn = Math.sin(DISC_ROT);
  const eu = u * cs - v * sn, ev = u * sn + v * cs;
  const ed = Math.hypot(eu / DISC_A, ev / DISC_B) - 1; // ~0 on the ellipse
  const discW = 0.065;
  let disc = gauss(ed, discW) * 1.25;
  const front = ev < 0; // the lower half passes in front of the horizon
  const behindHorizon = r < 0.215 && !front;
  if (behindHorizon) disc = 0;
  const doppler = 0.55 + 0.45 * clamp01(-eu / DISC_A);
  disc *= doppler * (front ? 1 : 0.55);
  cr += 210 * disc; cg += 150 * disc; cb += 255 * disc;

  // ---- composite with the halo outside the stone ----
  const haloA = 0.42 * Math.exp(-Math.max(0, r - R) / 0.085);
  const a = inside + (1 - inside) * haloA;
  const hr = 105, hg = 35, hb = 190;
  const outR = (cr * inside + hr * (1 - inside));
  const outG = (cg * inside + hg * (1 - inside));
  const outB = (cb * inside + hb * (1 - inside));
  return [outR, outG, outB, a];
}

// ---- render, supersampled -----------------------------------------------------
const acc = new Float64Array(SIZE * SIZE * 4);
for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    const u = ((x + 0.5) / W) * 2 - 1;
    const v = 1 - ((y + 0.5) / W) * 2;
    const [r, g, b, a] = shade(u * 1.08, v * 1.08);
    const i = ((y >> 1) * SIZE + (x >> 1)) * 4;
    // premultiplied accumulation so the halo's edge averages correctly
    acc[i] += r * a; acc[i + 1] += g * a; acc[i + 2] += b * a; acc[i + 3] += a;
  }
}
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const a = acc[i + 3] / (SS * SS);
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    const un = a > 0 ? 1 / acc[i + 3] : 0;
    raw[o] = Math.max(0, Math.min(255, Math.round(acc[i] * un)));
    raw[o + 1] = Math.max(0, Math.min(255, Math.round(acc[i + 1] * un)));
    raw[o + 2] = Math.max(0, Math.min(255, Math.round(acc[i + 2] * un)));
    raw[o + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
  }
}

// ---- PNG ----------------------------------------------------------------------
const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outs = [path.join(ROOT, "assets", "emoji", "abyss", "stone.png")];
if (fs.existsSync(path.join(ROOT, "emoji"))) outs.push(path.join(ROOT, "emoji", "abyss", "stone.png"));
for (const out of outs) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log(`wrote ${path.relative(ROOT, out)} (${png.length} bytes, ${SIZE}×${SIZE})`);
}
