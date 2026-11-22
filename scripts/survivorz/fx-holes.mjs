// SURVIVORZ EFFECTS — bakes the bullet holes (docs/survivorz/EFFECTS.md, F1's holes made real).
//
//   node scripts/survivorz/fx-holes.mjs
//   -> assets/downloads/survivorz/fx/holes/holes-{color,normal,rough}.{png,ktx2} + holes.json
//
// F1's holes were drawn on a canvas: a flat dark dot per surface, no depth, no variety, and
// the show's bar is "never a stand-in". The free Taproot pack's bullet hole was judged and
// dropped like its scorch (a black blob with hair-thin vein cracks). These are made here, the
// scorch's way: a HEIGHT FIELD per hole, so the normal map gives each one real depth in the
// room's light, plus colour and roughness. Four kinds across, two of each down:
//   CONCRETE  a dark hole in a spalled crater broken into chips, the fresh concrete inside
//             paler than the wall, aggregate showing, radial cracks, a ring of powder
//   METAL     a dimple punched in, the paint scraped back to shiny bare steel round it,
//             a ragged ring of chipped paint and primer
//   WOOD      a hole torn long along the grain, splinters lifted and pale raw wood showing
//             under the paint
//   GLASS     a white crushed rim, radial cracks out to the cell's edge and broken rings
//             between them
// Colour 2048×1024 (512 a cell), normal and roughness at half that; straight alpha with the
// colour bled under the clear pixels; normal in OpenGL convention.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "holes");
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";
const CELL = 512, COLS = 4, ROWS = 2, W = CELL * COLS, H = CELL * ROWS;

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
/** cellular noise: distance to the nearest and second-nearest of a jittered grid of points */
function cells2(seed) {
  const r = rngOf(seed), P = 64, jx = Float32Array.from({ length: P * P }, r), jy = Float32Array.from({ length: P * P }, r);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, k = ((cy & (P - 1)) * P) + (cx & (P - 1));
      const d = Math.hypot(cx + jx[k] - x, cy + jy[k] - y);
      if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
    }
    return [d1, d2, id];
  };
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** thin cracks: a few random-walk polylines from the rim outward, with branches, as a list of
 *  segments [x0, y0, x1, y1, width]; drawn by distance */
function crackNet(rng, count, r0, r1, wid, branch = 0.35, wobble = 0.35) {
  const segs = [];
  const walk = (x, y, a, len, w, depth) => {
    const steps = Math.max(3, Math.round(len / 0.03));
    for (let s = 0; s < steps; s++) {
      a += (rng() - 0.5) * wobble;
      const nx = x + Math.cos(a) * (len / steps), ny = y + Math.sin(a) * (len / steps);
      const ww = w * (1 - (s / steps) * 0.75);
      segs.push([x, y, nx, ny, ww]);
      if (depth < 2 && rng() < branch / steps * 3) walk(nx, ny, a + (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 0.6), len * (0.25 + rng() * 0.35), ww * 0.7, depth + 1);
      x = nx; y = ny;
    }
  };
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.8;
    walk(Math.cos(a) * r0, Math.sin(a) * r0, a, (r1 - r0) * (0.55 + rng() * 0.45), wid, 0);
  }
  return segs;
}
/** distance from (x, y) to the nearest crack, divided by that crack's width (< 1 = on it) */
function crackAt(segs, x, y) {
  let best = 9;
  for (const [x0, y0, x1, y1, w] of segs) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const t = clamp(((x - x0) * dx + (y - y0) * dy) / l2);
    const d = Math.hypot(x - x0 - dx * t, y - y0 - dy * t) / w;
    if (d < best) best = d;
  }
  return best;
}
/** the same, sped up: segments bucketed on a grid */
function crackField(segs) {
  const G = 24, buckets = Array.from({ length: G * G }, () => []);
  for (const s of segs) {
    const [x0, y0, x1, y1, w] = s;
    const pad = w * 3;
    const bx0 = Math.floor(((Math.min(x0, x1) - pad) * 0.5 + 0.5) * G), bx1 = Math.floor(((Math.max(x0, x1) + pad) * 0.5 + 0.5) * G);
    const by0 = Math.floor(((Math.min(y0, y1) - pad) * 0.5 + 0.5) * G), by1 = Math.floor(((Math.max(y0, y1) + pad) * 0.5 + 0.5) * G);
    for (let j = Math.max(0, by0); j <= Math.min(G - 1, by1); j++) for (let i = Math.max(0, bx0); i <= Math.min(G - 1, bx1); i++) buckets[j * G + i].push(s);
  }
  return (x, y) => {
    const i = Math.floor((x * 0.5 + 0.5) * G), j = Math.floor((y * 0.5 + 0.5) * G);
    if (i < 0 || j < 0 || i >= G || j >= G) return 9;
    const b = buckets[j * G + i];
    return b.length ? crackAt(b, x, y) : 9;
  };
}

// ---- the holes ---------------------------------------------------------------------------
// each returns f(x, y) for x, y in [-1, 1] (y DOWN the image) -> { a, rgb (linear), h, r }

function concrete(seed) {
  const rng = rngOf(seed), n = noise2(seed), n2 = noise2(seed + 7), chips = cells2(seed + 3);
  const crater = 0.27 + rng() * 0.06, core = 0.075 + rng() * 0.02;
  const cracks = crackField(crackNet(rng, 3 + Math.floor(rng() * 3), crater * 0.9, 0.85, 0.009, 0.15, 0.3));
  const wall = [0.2, 0.195, 0.19], fresh = [0.27, 0.26, 0.245], dark = [0.01, 0.009, 0.008], powder = [0.42, 0.41, 0.39];
  return (x, y) => {
    const r = Math.hypot(x, y), ang = Math.atan2(y, x);
    // the crater's edge: a few big bites out of the wall, ragged along big angular chips
    const [c1, c2, id] = chips(x * 4.2 + 11, y * 4.2 + 5);
    const bite = ((id * 2654435761) >>> 0) / 4294967296;
    const edge = crater * (0.7 + 0.55 * fbm(n, Math.cos(ang) * 1.5 + 3, Math.sin(ang) * 1.5 + 3, 3) + 0.18 * bite);
    const inCrater = 1 - smooth(edge * 0.97, edge * 1.01, r);
    const inCore = 1 - smooth(core * 0.85, core * 1.15, r + (fbm(n2, x * 14, y * 14, 3) - 0.5) * 0.05);
    // depth: a broken cone, each chip a flat facet at its own depth (conchoidal breaks)
    const t = clamp(r / edge);
    const facetDepth = -(1 - t) * 0.75 - bite * 0.18;
    const ridge = smooth(0, 0.06, c2 - c1); // the edges between facets
    let h = (facetDepth + (fbm(n2, x * 25, y * 25, 3) - 0.5) * 0.08) * inCrater - inCore * 1.6;
    // inside: fresh concrete, a shade paler than the wall, with aggregate, shadowed with depth
    const agg = fbm(n2, x * 26, y * 26, 3);
    let rgb = mix3(fresh, [0.17, 0.165, 0.16], smooth(0.45, 0.75, agg));
    rgb = mix3(rgb, [0.045, 0.043, 0.04], clamp(1 - t) * 0.75 + (1 - ridge) * 0.25);
    rgb = mix3(rgb, dark, inCore);
    let a = inCrater;
    // hairline cracks running out across the wall
    const onCrack = (1 - smooth(0.3, 1.0, cracks(x, y))) * (1 - inCrater);
    rgb = mix3(rgb, [0.06, 0.058, 0.055], onCrack);
    a = Math.max(a, onCrack * 0.75);
    h -= onCrack * 0.2;
    // a little paint and surface flaked off just past the crater, and the powder blown out
    const flake = (1 - smooth(edge * 1.05, edge * 1.25, r + (fbm(n, x * 9, y * 9, 4) - 0.5) * 0.12)) * (1 - inCrater);
    if (flake > 0) { rgb = mix3(rgb, wall, flake * (1 - a)); a = Math.max(a, flake * 0.9); h -= flake * 0.06; }
    const pw = smooth(edge, edge * 1.15, r) * (1 - smooth(edge * 1.25, edge * 2.2, r)) * smooth(0.4, 0.75, fbm(n, x * 7, y * 7, 4));
    if (pw > 0 && a < 1) { const k = pw * 0.35 * (1 - a); rgb = mix3(rgb, powder, k / Math.max(1e-4, a + k)); a = a + k; }
    return { a: a * (1 - smooth(0.74, 0.88, r)), rgb, h, r: 0.95 };
  };
}

function metal(seed) {
  const rng = rngOf(seed), n = noise2(seed), n2 = noise2(seed + 5);
  const hole = 0.085 + rng() * 0.015, dimple = 0.24 + rng() * 0.04;
  const scratches = crackField(crackNet(rng, 9, hole * 1.3, dimple * 1.3, 0.004, 0.05, 0.08));
  const bare = [0.42, 0.43, 0.45], lead = [0.07, 0.07, 0.075], primer = [0.24, 0.12, 0.08];
  return (x, y) => {
    const r = Math.hypot(x, y), ang = Math.atan2(y, x);
    const wob = fbm(n, Math.cos(ang) * 2.5 + 5, Math.sin(ang) * 2.5 + 5, 4) - 0.5;
    const inHole = 1 - smooth(hole * 0.9, hole * 1.1, r + wob * 0.025);
    // the dimple: pushed in round the hole, a curled lip of torn steel at its edge
    const d = r / dimple;
    let h = -0.75 * Math.max(0, 1 - d * d) + 0.4 * Math.exp(-((r - hole * 1.12) ** 2) / 0.0004) - inHole * 1.5;
    // a thin ragged ring of bare steel, a smear of lead and soot over it, paint chipped past it
    const bareEdge = hole * (1.45 + wob * 1.4 + (fbm(n2, x * 9, y * 9, 3) - 0.5) * 0.9);
    const onBare = (1 - smooth(bareEdge * 0.95, bareEdge * 1.05, r)) * (1 - inHole);
    const chipEdge = dimple * (1.05 + (fbm(n2, x * 6, y * 6, 4) - 0.5) * 1.1);
    const onChip = (1 - smooth(chipEdge * 0.95, chipEdge * 1.05, r)) * (1 - onBare) * (1 - inHole);
    const smear = (1 - smooth(hole, dimple * 1.2, r)) * smooth(0.35, 0.7, fbm(n, x * 12, y * 12, 3));
    const grain = fbm(n2, x * 3, y * 60, 2);
    let rgb = mix3(primer, [0.14, 0.13, 0.13], smooth(0.3, 0.8, fbm(n, x * 16, y * 16, 3)));
    rgb = mix3(rgb, mix3(bare, [0.3, 0.31, 0.33], grain), onBare);
    rgb = mix3(rgb, [0.62, 0.63, 0.65], (1 - smooth(0.3, 1, scratches(x, y))) * (onBare + onChip * 0.5) * 0.5);
    rgb = mix3(rgb, lead, smear * 0.7);
    rgb = mix3(rgb, [0.006, 0.006, 0.006], inHole);
    h += 0.07 * onChip;
    const rough = mix(mix(0.7, 0.3, onBare * (1 - smear * 0.6)), 0.9, inHole);
    const a = Math.max(inHole, onBare, onChip * 0.95, smear * 0.6) * (1 - smooth(0.7, 0.86, r));
    return { a, rgb, h, r: rough };
  };
}

function wood(seed) {
  const rng = rngOf(seed), n = noise2(seed), n2 = noise2(seed + 9);
  const rx = 0.075 + rng() * 0.02, ry = 0.15 + rng() * 0.05;
  const raw = [0.52, 0.37, 0.22], dark = [0.02, 0.015, 0.01];
  return (x, y) => {
    // the grain runs down the cell (y); a hole tears long along it
    const e = Math.hypot(x / rx, y / ry);
    const fib = fbm(n2, x * 70, y * 4, 3); // long fibres
    const inHole = 1 - smooth(0.85, 1.1, e + (fib - 0.5) * 0.5);
    // splinters: fibres torn out round the hole, longer along the grain
    const tear = Math.hypot(x / (rx * 2.2), y / (ry * 2.6)) + (fib - 0.5) * 0.9 + (fbm(n, x * 10, y * 3, 3) - 0.5) * 0.4;
    const torn = (1 - smooth(0.75, 1.0, tear)) * (1 - inHole);
    // the paint broken off round the tear
    const pe = Math.hypot(x / (rx * 3), y / (ry * 2.4)) + (fbm(n, x * 7, y * 7, 4) - 0.5) * 0.5;
    const flake = (1 - smooth(0.85, 0.95, pe)) * (1 - torn) * (1 - inHole);
    let rgb = mix3(raw, [0.72, 0.56, 0.36], smooth(0.4, 0.8, fib));
    rgb = mix3(rgb, [0.3, 0.2, 0.11], smooth(0.5, 1, Math.hypot(x / (rx * 1.6), y / (ry * 1.4))) * 0 + (1 - smooth(0.5, 1, tear)) * 0.35);
    rgb = mix3(rgb, [0.4, 0.38, 0.34], flake); // the undercoat where flakes came off
    rgb = mix3(rgb, dark, inHole);
    const h = (fib - 0.5) * 0.5 * torn + torn * 0.25 + flake * -0.05 - inHole * 1.4;
    const a = Math.max(inHole, torn, flake * 0.9) * (1 - smooth(0.72, 0.88, Math.hypot(x, y)));
    return { a, rgb, h, r: 0.85 };
  };
}

function glass(seed) {
  const rng = rngOf(seed), n = noise2(seed);
  const hole = 0.025 + rng() * 0.01, crush = 0.09 + rng() * 0.03;
  const radial = crackField(crackNet(rng, 11 + Math.floor(rng() * 5), crush * 0.8, 0.95, 0.008, 0.25, 0.12));
  // broken rings between the radials: short arcs at two or three radii
  const arcs = [];
  for (let R of [0.22 + rng() * 0.06, 0.42 + rng() * 0.08, 0.65 + rng() * 0.1]) {
    let a = rng() * 6.28;
    while (a < 6.28 * 1.6) {
      const len = 0.2 + rng() * 0.5;
      if (rng() < 0.6) for (let s = 0; s < 6; s++) {
        const a0 = a + (s / 6) * len, a1 = a + ((s + 1) / 6) * len;
        R *= 0.99 + rng() * 0.02;
        arcs.push([Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R, 0.009]);
      }
      a += len + rng() * 0.5;
    }
  }
  const rings = crackField(arcs);
  return (x, y) => {
    const r = Math.hypot(x, y);
    const inHole = 1 - smooth(hole * 0.8, hole * 1.2, r);
    const crushed = (1 - smooth(crush * 0.8, crush * 1.15, r + (fbm(n, x * 20, y * 20, 3) - 0.5) * 0.03)) * (1 - inHole);
    const c = Math.max(1 - smooth(0.3, 1, radial(x, y)), (1 - smooth(0.3, 1, rings(x, y))) * 0.85);
    // crushed glass and cracks catch the light white; the hole itself shows only its rim
    const a = Math.max(crushed * 0.9, c * 0.85, inHole * 0.35) * (1 - smooth(0.74, 0.88, r));
    const rgb = mix3([0.9, 0.95, 0.95], [0.75, 0.82, 0.82], fbm(n, x * 40, y * 40, 2));
    const h = c * 0.15 + crushed * (fbm(n, x * 50, y * 50, 2) - 0.5) * 0.6;
    return { a, rgb, h, r: 0.15 };
  };
}

// ---- bake ----------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const make = [concrete, metal, wood, glass];
const color = Buffer.alloc(W * H * 4), height = new Float32Array(W * H), rough = new Float32Array(W * H), alpha = new Float32Array(W * H);
const srgb = (lin) => Math.round(255 * clamp(lin <= 0.0031308 ? lin * 12.92 : 1.055 * lin ** (1 / 2.4) - 0.055));
for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
  const f = make[col](1000 + row * 97 + col * 13);
  const ox = col * CELL, oy = row * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const u = (x + 0.5) / CELL * 2 - 1, v = (y + 0.5) / CELL * 2 - 1;
    const p = f(u, v);
    const k = (oy + y) * W + ox + x;
    color[k * 4] = srgb(p.rgb[0]); color[k * 4 + 1] = srgb(p.rgb[1]); color[k * 4 + 2] = srgb(p.rgb[2]);
    color[k * 4 + 3] = Math.round(255 * clamp(p.a));
    alpha[k] = clamp(p.a);
    // height and roughness only count where the hole is
    height[k] = p.h * smooth(0, 0.5, p.a);
    rough[k] = p.r;
  }
}
const cpng = path.join(OUT, "holes-color.png");
await sharp(color, { raw: { width: W, height: H, channels: 4 } }).png().toFile(cpng);
// the normal and roughness at half size
const NW = W / 2, NH = H / 2, normal = Buffer.alloc(NW * NH * 4), roughB = Buffer.alloc(NW * NH * 4), K = 9;
const T = (x, y) => height[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
  const dx = (T(2 * x + 2, 2 * y) - T(2 * x - 2, 2 * y)) * K, dy = (T(2 * x, 2 * y + 2) - T(2 * x, 2 * y - 2)) * K;
  const l = Math.hypot(dx, dy, 1), o = (y * NW + x) * 4;
  normal[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); normal[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
  normal[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); normal[o + 3] = 255;
  const rr = Math.round(255 * rough[2 * y * W + 2 * x]);
  roughB[o] = rr; roughB[o + 1] = rr; roughB[o + 2] = rr; roughB[o + 3] = 255;
}
const npng = path.join(OUT, "holes-normal.png"), rpng = path.join(OUT, "holes-rough.png");
await sharp(normal, { raw: { width: NW, height: NH, channels: 4 } }).png().toFile(npng);
await sharp(roughB, { raw: { width: NW, height: NH, channels: 4 } }).png().toFile(rpng);
// a review sheet: each hole on a wall-ish grey, lit from the top left by its own normal
{
  const S = Buffer.alloc(W * H * 3);
  const L = [-0.5, 0.6, 0.62];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, o = ((y >> 1) * NW + (x >> 1)) * 4;
    const nx = normal[o] / 127.5 - 1, ny = normal[o + 1] / 127.5 - 1, nz = normal[o + 2] / 127.5 - 1;
    const lit = clamp(0.35 + 0.9 * (nx * L[0] + ny * L[1] + nz * L[2]), 0, 1.4);
    const bg = [0.42, 0.42, 0.43], a = alpha[k];
    for (let ch = 0; ch < 3; ch++) {
      const base = color[k * 4 + ch] / 255;
      S[k * 3 + ch] = Math.round(255 * clamp(mix(bg[ch], base, a) * mix(1, lit, smooth(0, 0.3, a))));
    }
  }
  await sharp(S, { raw: { width: W, height: H, channels: 3 } }).resize(1024, 512).png().toFile(path.join(OUT, "holes-preview.png"));
}
const files = {};
for (const [name, p, fmt, tf] of [["color", cpng, "R8G8B8A8_SRGB", "srgb"], ["normal", npng, "R8G8B8A8_UNORM", "linear"], ["rough", rpng, "R8G8B8A8_UNORM", "linear"]]) {
  const k2 = p.replace(".png", ".ktx2");
  execFileSync(KTX, ["create", "--format", fmt, "--assign-tf", tf, "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--zstd", "18", "--generate-mipmap", p, k2], { stdio: ["ignore", "ignore", "inherit"] });
  files[name] = { png: path.basename(p), ktx2: path.basename(k2) };
}
fs.writeFileSync(path.join(OUT, "holes.json"), JSON.stringify({
  made: new Date().toISOString(), width: W, height: H, cols: COLS, rows: ROWS, ...files,
  kinds: ["concrete", "metal", "wood", "glass"], variants: ROWS,
  contract: "column = kind (concrete, metal, wood, glass), row = variant; colour sRGB straight alpha; normal linear OpenGL (+y up); roughness in every channel; the grain of a wood hole runs down its cell",
}, null, 1));
for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(22), (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), "KB");
