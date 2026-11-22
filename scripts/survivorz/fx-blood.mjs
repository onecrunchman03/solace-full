// SURVIVORZ EFFECTS — bakes the blood decals (docs/survivorz/EFFECTS.md, step F2)
// from the ActionVFX free blood photographs Josh downloaded (commercial use
// allowed): 27 pools, 8 sprays, 2 footprint trails and 3 handprint sets, each a
// 2592×1944 RGBA photo with the blood somewhere in the middle of it.
//
//   node scripts/survivorz/fx-blood.mjs
//   -> assets/downloads/survivorz/fx/blood/{splat,pools}-*.{png,ktx2} + blood.json
//
// TWO ATLASES, sized for the memory budget (the effects had 11 MB left of 150):
//   splat  1024², 4×4 — the eight sprays (the directional ones TURNED so the spray
//          runs along +x, its sparse tail at the right) and eight small splats.
//          Wall spatter and drops.
//   pools  2048², 4×4 — twelve pools, two footprint trails, two handprint sets.
//          Floor pools, drag smears, prints.
// Each gets a NORMAL MAP at half size, made from the blood's thickness (alpha,
// lifted by how dark the blood is), so a wet pool catches the light; the shine
// itself (roughness) is driven by the mark's wetness in the shader, so no
// roughness map is needed. The pools also get a SPREAD map (R, quarter size):
// the order in which each pool fills from its middle out, so a pool can grow
// under a body without its geometry being rebuilt.
//
// Every crop is the blood's own bounding box plus a margin, made square around its
// middle; every cell keeps a 4% clear border so mips don't bleed between cells.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "..");
const SRC = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "src", "actionvfx-blood");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "fx", "blood");
// the mean red (linear) every cell is brought to: fresh blood, well lit
const TARGET_RED = 0.17;
const KTX = process.env.KTX_BIN || "D:/solace-ai/tools/ktx/bin/ktx.exe";

// cell 0 is top-left; kinds say what a recipe may use a cell for
const SPLAT = {
  size: 1024, cols: 4, rows: 4,
  cells: [
    { file: "Blood Spray 1", kind: "burst" }, { file: "Blood Spray 2", kind: "burst" }, { file: "Blood Spray 3", kind: "burst" },
    { file: "Blood Spray 4", kind: "spray", turn: true }, { file: "Blood Spray 5", kind: "spray", turn: true },
    { file: "Blood Spray 6", kind: "spray", turn: true }, { file: "Blood Spray 7", kind: "spray", turn: true },
    { file: "Blood Spray 8", kind: "spray", turn: true },
    { file: "Blood Pool 13", kind: "drop" }, { file: "Blood Pool 14", kind: "drop" }, { file: "Blood Pool 18", kind: "drop" },
    { file: "Blood Pool 22", kind: "drop" }, { file: "Blood Pool 23", kind: "drop" }, { file: "Blood Pool 24", kind: "drop" },
    { file: "Blood Pool 25", kind: "drop" }, { file: "Blood Pool 27", kind: "drop" },
  ],
};
const POOLS = {
  size: 2048, cols: 4, rows: 4, spread: true,
  cells: [
    { file: "Blood Pool 2", kind: "pool" }, { file: "Blood Pool 3", kind: "pool" }, { file: "Blood Pool 26", kind: "pool" },
    { file: "Blood Pool 20", kind: "pool" }, { file: "Blood Pool 21", kind: "pool" }, { file: "Blood Pool 5", kind: "pool" },
    { file: "Blood Pool 11", kind: "pool" }, { file: "Blood Pool 17", kind: "pool" },
    { file: "Blood Pool 8", kind: "smear", turn: true }, { file: "Blood Pool 1", kind: "smear", turn: true },
    { file: "Blood Pool 6", kind: "smear", turn: true }, { file: "Blood Pool 9", kind: "smear", turn: true },
    // a pool somebody walked through; then a trail of single prints (each one cut out, toe at
    // the top of the cell); a wall someone clawed along; and two single hands
    { file: "Bloody Footprints 1", kind: "pool" }, { file: "Bloody Footprints 2", kind: "footprints", parts: true },
    { file: "Bloody Handprints 1", kind: "handsmear" }, { file: "Bloody Handprints 3", kind: "handprints", parts: true },
  ],
};

async function load(file) {
  const { data, info } = await sharp(path.join(SRC, `${file}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** The main axis of the blood (radians, image coords) and which end is the sparse tail. */
function axisOf(img) {
  let m = 0, sx = 0, sy = 0;
  for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
    const a = img.data[(y * img.w + x) * 4 + 3] / 255;
    m += a; sx += a * x; sy += a * y;
  }
  const cx = sx / m, cy = sy / m;
  let xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
    const a = img.data[(y * img.w + x) * 4 + 3] / 255;
    xx += a * (x - cx) ** 2; yy += a * (y - cy) ** 2; xy += a * (x - cx) * (y - cy);
  }
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  // the third moment along the axis: positive = the long thin tail lies toward +axis
  const ux = Math.cos(theta), uy = Math.sin(theta);
  let skew = 0;
  for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
    const a = img.data[(y * img.w + x) * 4 + 3] / 255;
    const t = (x - cx) * ux + (y - cy) * uy;
    skew += a * t * t * t;
  }
  return { theta, skew };
}

/** The blood cut out square around its middle, turned if asked, at `cell` pixels. */
async function cellImage(spec, cell) {
  let img = await load(spec.file);
  let pipe = sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });
  if (spec.turn) {
    const { theta, skew } = axisOf(img);
    // turn the axis onto +x (sharp turns clockwise for a positive angle; y is down)
    let deg = -theta * 180 / Math.PI;
    if (skew < 0) deg += 180; // the tail to the right
    const t = await pipe.rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true });
    img = { data: t.data, w: t.info.width, h: t.info.height };
    pipe = sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });
  }
  let x0 = img.w, y0 = img.h, x1 = 0, y1 = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 10) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const side = Math.ceil(Math.max(x1 - x0, y1 - y0) * 1.04) + 2;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const left = Math.round(cx - side / 2), top = Math.round(cy - side / 2);
  // pad so the square fits, then cut it
  const pad = Math.max(0, -left, -top, left + side - img.w, top + side - img.h);
  const padded = await pipe.extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true });
  const inner = Math.round(cell * 0.92);
  const out = await sharp(padded.data, { raw: { width: padded.info.width, height: padded.info.height, channels: 4 } })
    .extract({ left: left + pad, top: top + pad, width: side, height: side })
    .resize(inner, inner, { kernel: "lanczos3" })
    .extend({ top: (cell - inner) >> 1, bottom: cell - inner - ((cell - inner) >> 1), left: (cell - inner) >> 1, right: cell - inner - ((cell - inner) >> 1), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer();
  // the photographs leave a faint whitish haze round the blood; it reads as pink fog on a
  // dark floor, so anything that faint goes
  for (let i = 3; i < out.length; i += 4) if (out[i] < 14) out[i] = 0;
  // ONE BLOOD TONE: the photographs were shot differently (some pools are near black, two
  // are bright glossy red), so each is scaled to the same mean red where it's solid; the
  // runtime tints from there (a survivor's, a zombie's, wet, dry)
  const lin = (c) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const srgb = (l) => Math.round(255 * Math.min(1, l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
  let sum = 0, n = 0;
  for (let i = 0; i < out.length; i += 4) if (out[i + 3] > 128) { sum += lin(out[i]); n++; }
  if (n) {
    const k = TARGET_RED / (sum / n);
    for (let i = 0; i < out.length; i += 4) for (let c = 0; c < 3; c++) out[i + c] = srgb(lin(out[i + c]) * k);
  }
  return out;
}

/** Fill the colour under transparent pixels with the nearest blood's colour (several
 *  passes of a dilation), so mips and filtering never pull black into the edges. */
function bleed(buf, w, h, passes = 12) {
  const done = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) done[i] = buf[i * 4 + 3] > 8 ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const next = done.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (done[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X;
        if (!done[j]) continue;
        r += buf[j * 4]; g += buf[j * 4 + 1]; b += buf[j * 4 + 2]; n++;
      }
      if (n) {
        buf[i * 4] = r / n; buf[i * 4 + 1] = g / n; buf[i * 4 + 2] = b / n;
        next[i] = 1;
      }
    }
    done.set(next);
  }
}

/** A separable box blur of one float channel, `r` pixels, `it` times (≈ gaussian). */
function blur(src, w, h, r, it = 2) {
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let k = 0; k < it; k++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

function ktx(png, out, format, srgb) {
  execFileSync(KTX, ["create", "--format", format, "--assign-tf", srgb ? "srgb" : "linear", "--encode", "uastc", "--uastc-quality", "2",
    "--uastc-rdo", "--zstd", "18", "--generate-mipmap", png, out], { stdio: ["ignore", "ignore", "inherit"] });
}

async function bake(name, atlas) {
  const { size, cols, rows } = atlas;
  const cell = size / cols;
  const color = Buffer.alloc(size * size * 4);
  for (const [i, spec] of atlas.cells.entries()) {
    const buf = await cellImage(spec, cell);
    const ox = (i % cols) * cell, oy = Math.floor(i / cols) * cell;
    for (let y = 0; y < cell; y++) buf.copy(color, ((oy + y) * size + ox) * 4, y * cell * 4, (y + 1) * cell * 4);
  }
  // the thickness: coverage, lifted where the blood is darker (it pooled deeper there)
  const alpha = new Float32Array(size * size), thick = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const a = color[i * 4 + 3] / 255;
    const lum = (0.3 * color[i * 4] + 0.59 * color[i * 4 + 1] + 0.11 * color[i * 4 + 2]) / 255;
    alpha[i] = a;
    thick[i] = a * (0.55 + 0.45 * (1 - Math.min(1, lum * 2.2)));
  }
  bleed(color, size, size, 16);
  const files = {};
  const colorPng = path.join(OUT, `${name}-color.png`);
  await sharp(color, { raw: { width: size, height: size, channels: 4 } }).png().toFile(colorPng);
  ktx(colorPng, colorPng.replace(".png", ".ktx2"), "R8G8B8A8_SRGB", true);
  files.color = { png: path.basename(colorPng), ktx2: path.basename(colorPng).replace(".png", ".ktx2") };

  // the normal, at half size, from the blurred thickness: a meniscus round every edge
  const ns = size / 2;
  const h = blur(thick, size, size, Math.max(1, Math.round(size / 512)), 2);
  const normal = Buffer.alloc(ns * ns * 4);
  const k = size / 160;
  for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
    const X = x * 2, Y = y * 2;
    const at = (xx, yy) => h[Math.min(size - 1, Math.max(0, yy)) * size + Math.min(size - 1, Math.max(0, xx))];
    const dx = (at(X + 2, Y) - at(X - 2, Y)) * k, dy = (at(X, Y + 2) - at(X, Y - 2)) * k;
    // image y runs down while the decal's tangent-space +y runs up the cell
    const nx = -dx, ny = dy, nz = 1, l = Math.hypot(nx, ny, nz);
    const o = (y * ns + x) * 4;
    normal[o] = Math.round((nx / l * 0.5 + 0.5) * 255);
    normal[o + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
    normal[o + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
    normal[o + 3] = 255;
  }
  const normalPng = path.join(OUT, `${name}-normal.png`);
  await sharp(normal, { raw: { width: ns, height: ns, channels: 4 } }).png().toFile(normalPng);
  ktx(normalPng, normalPng.replace(".png", ".ktx2"), "R8G8B8A8_UNORM", false);
  files.normal = { png: path.basename(normalPng), ktx2: path.basename(normalPng).replace(".png", ".ktx2") };

  if (atlas.spread) {
    // the order a pool fills in: its middle first, out along its own shape, the edge last.
    // A pool's distance from its weighted middle, scaled by how far its blood reaches in
    // that direction, roughened by a wide blur of its coverage so it doesn't grow as a disc
    const ss = size / 4;
    const wide = blur(alpha, size, size, Math.round(size / 96), 2);
    const spread = Buffer.alloc(ss * ss);
    for (const [i] of atlas.cells.entries()) {
      const ox = (i % cols) * cell, oy = Math.floor(i / cols) * cell;
      let m = 0, sx = 0, sy = 0;
      for (let y = 0; y < cell; y += 2) for (let x = 0; x < cell; x += 2) {
        const a = alpha[(oy + y) * size + ox + x];
        m += a; sx += a * x; sy += a * y;
      }
      const cx = sx / Math.max(1e-6, m), cy = sy / Math.max(1e-6, m);
      // how far the blood reaches, per direction (64 bins)
      const reach = new Float32Array(64).fill(1);
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        if (alpha[(oy + y) * size + ox + x] < 0.1) continue;
        const d = Math.hypot(x - cx, y - cy), bin = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * 64) % 64;
        if (d > reach[bin]) reach[bin] = d;
      }
      // smooth the reach round the circle so a single drip doesn't make a spike
      let sm = reach;
      for (let k = 0; k < 4; k++) sm = sm.map((_, b) => (sm[(b + 63) % 64] + 2 * sm[b] + sm[(b + 1) % 64]) / 4);
      const sc = ss / cols;
      for (let y = 0; y < sc; y++) for (let x = 0; x < sc; x++) {
        const X = x * 4, Y = y * 4;
        const d = Math.hypot(X - cx, Y - cy), bin = Math.floor(((Math.atan2(Y - cy, X - cx) + Math.PI) / (2 * Math.PI)) * 64) % 64;
        let v = d / sm[bin];
        v = 0.8 * v + 0.2 * (1 - wide[(oy + Y) * size + ox + X]);
        spread[(Math.floor(oy / 4) + y) * ss + Math.floor(ox / 4) + x] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      }
    }
    // smooth it, so the front of a growing pool is a soft wobbling edge rather than spokes
    const sf = blur(Float32Array.from(spread, (v) => v / 255), ss, ss, 3, 3);
    for (let i = 0; i < spread.length; i++) spread[i] = Math.round(Math.min(1, sf[i]) * 255);
    const spreadPng = path.join(OUT, `${name}-spread.png`);
    await sharp(spread, { raw: { width: ss, height: ss, channels: 1 } }).png().toFile(spreadPng);
    ktx(spreadPng, spreadPng.replace(".png", ".ktx2"), "R8_UNORM", false);
    files.spread = { png: path.basename(spreadPng), ktx2: path.basename(spreadPng).replace(".png", ".ktx2") };
  }
  // the separate prints in a cell, each as a rect in the cell (0..1, image y down): the blood
  // dilated a little so a print's toe and heel are one thing, then its connected pieces
  const partsOf = (i) => {
    const ox = (i % cols) * cell, oy = Math.floor(i / cols) * cell;
    const D = 4, w = cell / D;
    const m = new Uint8Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let yy = 0; yy < D; yy++) for (let xx = 0; xx < D; xx++) a = Math.max(a, alpha[(oy + y * D + yy) * size + ox + x * D + xx]);
      m[y * w + x] = a > 0.45 ? 1 : 0;
    }
    const R = 1, dil = new Uint8Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < w) dil[Y * w + X] = 1;
      }
    }
    const seen = new Int32Array(w * w).fill(-1), out = [];
    for (let s0 = 0; s0 < w * w; s0++) {
      if (!dil[s0] || seen[s0] >= 0) continue;
      const stack = [s0];
      seen[s0] = out.length;
      let x0 = w, y0 = w, x1 = 0, y1 = 0, n = 0;
      while (stack.length) {
        const k = stack.pop(), x = k % w, y = (k / w) | 0;
        if (m[k]) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy, j = Y * w + X;
          if (X >= 0 && Y >= 0 && X < w && Y < w && dil[j] && seen[j] < 0) { seen[j] = out.length; stack.push(j); }
        }
      }
      if (n > w * w * 0.012) out.push({ rect: [x0 / w, y0 / w, (x1 + 1) / w, (y1 + 1) / w].map((v) => +v.toFixed(4)), area: n });
    }
    return out.map(({ rect }) => rect);
  };
  return { size, cols, rows, ...files, cells: atlas.cells.map((c, i) => ({ cell: i, kind: c.kind, from: c.file, ...(c.parts ? { parts: partsOf(i) } : {}) })) };
}

fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const out = {
  made: new Date().toISOString(),
  source: "ActionVFX Free Blood Textures (2.5K), commercial use",
  contract: "cell 0 top-left; sprays and smears turned so they run along +x with the sparse tail at +x; colour sRGB straight alpha (colour bled under the transparent pixels); normal linear (tangent space, +y up the cell); spread R linear, 0 fills first",
  splat: await bake("splat", SPLAT),
  pools: await bake("pools", POOLS),
};
fs.writeFileSync(path.join(OUT, "blood.json"), JSON.stringify(out, null, 1));
for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(24), (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), "KB");
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
