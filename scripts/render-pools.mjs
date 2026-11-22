// Top-down Poolrooms renderer — the map-review tool for the Level 1 world.
//
//   node scripts/render-pools.mjs <seed> [size] [outPrefix]
//
// White-tile palette: water in blues (deeper = darker), decks in tile-white
// shaded by height, drains near-black, columns slate. Build first (npm run
// build); this consumes dist/backrooms/worldgen-pools.js.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dyn = (...p) =>
  import(new URL("file:///" + path.join(here, "..", ...p).split(path.sep).join("/")));
const { generatePoolsSector, validatePoolsSector, distanceMap } = await dyn(
  "dist", "backrooms", "worldgen-pools.js",
);
const { PIT_LETHAL, WATER_NONE } = await dyn("dist", "backrooms", "worldgen.js");

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function writePng(file, width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
}

// Optional 5th arg: a redesign candidate style (lido | cistern | atrium).
const style = process.argv[5] ?? "";
const seed = Number(process.argv[2] ?? 20260731);
const size = Number(process.argv[3] ?? 322);
const outPrefix = process.argv[4] ?? path.join(here, "..", "docs", "backrooms", `pools-${seed}`);

const gen2 = style ? await dyn("dist", "backrooms", "worldgen-pools2.js") : null;
const s = style ? gen2.generatePoolsCandidate(style, seed, size) : generatePoolsSector(seed, size);
const report = validatePoolsSector(s);
const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));

const SCALE = 4;
const W = size * SCALE;
const img = Buffer.alloc(W * W * 4);
const put = (px, py, r, g, b) => {
  if (px < 0 || py < 0 || px >= W || py >= W) return;
  const i = (py * W + px) * 4;
  img[i] = r;
  img[i + 1] = g;
  img[i + 2] = b;
  img[i + 3] = 255;
};
const rect = (px, py, w, h, r, g, b) => {
  for (let y = py; y < py + h; y++) for (let x = px; x < px + w; x++) put(x, y, r, g, b);
};

// Deck tints per district (all near-white — this IS the poolrooms).
const DECK = {
  natatorium: [236, 238, 240],
  shallows: [226, 232, 234],
  soak: [232, 230, 226],
  poolmaze: [222, 220, 214],
  channels: [230, 232, 230],
  sundeck: [238, 234, 226],
};
const WALL = [96, 104, 112];
const SOLID = [130, 138, 148];
const LANDMARK_TINT = [255, 214, 140];
const DOOR = [92, 220, 120];
const PIT = [14, 12, 12];

const districtType = new Map(s.districts.map((d) => [d.id, d.type]));
const water = s.water;

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let [r, g, b] = DECK[districtType.get(s.district[i])] ?? [230, 230, 230];
    if (s.landmark[i]) {
      const t = LANDMARK_TINT;
      r = (r * 2 + t[0]) / 3;
      g = (g * 2 + t[1]) / 3;
      b = (b * 2 + t[2]) / 3;
    }
    const h = s.floor[i];
    const lift = 1 + Math.max(-0.5, Math.min(0.25, h * 0.06));
    r *= lift;
    g *= lift;
    b *= lift;
    if (water && water[i] !== WATER_NONE) {
      const depth = water[i] - s.floor[i]; // steps of water
      const t = Math.min(1, depth / 4);
      r = 90 - 55 * t;
      g = 180 - 80 * t;
      b = 210 - 60 * t;
    }
    if (s.floor[i] <= -PIT_LETHAL) [r, g, b] = PIT;
    if (s.solid[i]) [r, g, b] = SOLID;
    rect(x * SCALE, y * SCALE, SCALE, SCALE, Math.min(255, r), Math.min(255, g), Math.min(255, b));
    if (s.wallN[i]) rect(x * SCALE, y * SCALE, SCALE, 1, ...WALL);
    if (s.wallW[i]) rect(x * SCALE, y * SCALE, 1, SCALE, ...WALL);
  }
}
rect(0, W - 1, W, 1, ...WALL);
rect(W - 1, 0, 1, W, ...WALL);
for (const d of s.doors) {
  rect(d.x * SCALE - 4, d.y * SCALE - 4, SCALE + 8, SCALE + 8, ...DOOR);
}

writePng(`${outPrefix}.png`, W, W, img);

// Reachability check view: magenta must never appear.
const heat = Buffer.alloc(W * W * 4);
const maxD = report.maxDistFromDoors || 1;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let r = 16, g = 12, b = 10;
    if (s.floor[i] <= -PIT_LETHAL) [r, g, b] = PIT;
    else if (!s.solid[i]) {
      const d = dist[i];
      if (d < 0) [r, g, b] = [255, 0, 255];
      else {
        const t = d / maxD;
        r = 250 - 180 * t;
        g = 240 - 200 * t;
        b = 200 - 180 * t;
      }
    }
    for (let py = 0; py < SCALE; py++) {
      for (let px = 0; px < SCALE; px++) {
        const j = ((y * SCALE + py) * W + x * SCALE + px) * 4;
        heat[j] = r;
        heat[j + 1] = g;
        heat[j + 2] = b;
        heat[j + 3] = 255;
      }
    }
  }
}
writePng(`${outPrefix}-heat.png`, W, W, heat);

console.log(JSON.stringify({
  seed,
  wet: report.wetPct.toFixed(1),
  bodies: report.waterBodies,
  spill: report.spillEdges,
  reach: report.reachablePct,
  landmarks: s.landmarks.map((l) => l.name),
  doors: s.doors.map((d) => d.name),
}, null, 1));
