// Top-down sector renderer — the map-review tool for the Backrooms world
// generator. Zero dependencies: writes PNGs by hand (zlib + CRC32).
//
//   node scripts/render-sector.mjs <seed> [size] [outPrefix] [--lobby]
//
// --lobby renders the Level 0 built from hand-drawn rooms (worldgen-lobby.ts,
// sector A4 on) instead of the retired rule-built generator.
//
// Produces <outPrefix>.png (the map) and <outPrefix>-heat.png (depth from the
// four doors — the "how deep can you get" view). Build the backend first
// (npm run build); this consumes dist/backrooms/worldgen.js.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const { generateSector: rulesSector, validateSector, distanceMap, PIT_LETHAL } = await import(
  new URL(`file:///${path.join(here, "..", "dist", "backrooms", "worldgen.js").replace(/\\/g, "/")}`)
);
const { generateLobbySector } = await import(new URL(`file:///${path.join(here, "..", "dist", "backrooms", "worldgen-lobby.js").replace(/\\/g, "/")}`));
const generateSector = process.argv.includes("--lobby") ? generateLobbySector : rulesSector;

// ---- Minimal PNG writer (RGBA8, no interlace) ------------------------------

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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // Scanlines with filter byte 0.
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

// ---- Render ----------------------------------------------------------------

const seed = Number(process.argv[2] ?? 20260725);
const size = Number(process.argv[3] ?? 256);
const outPrefix = process.argv[4] ?? path.join(here, "..", "docs", "backrooms", "sector-a");

const s = generateSector(seed, size);
const report = validateSector(s);
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

// Level-0 map palette: floors by district type, landmarks tinted, the void
// outside is what the Solace main map will show as "unexplored black".
const FLOOR = {
  classic: [201, 178, 106],
  pillars: [214, 193, 124],
  offices: [185, 163, 95],
  warrens: [168, 145, 79],
  halls: [194, 171, 99],
  // v2 verticality districts
  atrium: [222, 205, 140],
  terraces: [206, 186, 112],
  sublevel: [150, 130, 72],
  // the Sep 2026 rooms
  manila: [150, 124, 78],
  restrooms: [214, 216, 206],
  panelled: [120, 86, 52],
  storage: [150, 147, 138],
  unlit: [70, 62, 40],
};
const WALL = [43, 36, 19];
const SOLID = [58, 47, 24];
const LANDMARK_TINT = [216, 146, 84];
const DOOR = [255, 58, 42]; // red, like every door marker (Sep 2026)
const PIT = [16, 12, 10]; // a hole reads as a hole
const SCENERY = [96, 104, 126]; // cold blue: real geometry, no way in

const districtType = new Map(s.districts.map((d) => [d.id, d.type]));

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let [r, g, b] = FLOOR[districtType.get(s.district[i]) ?? "classic"];
    if (s.landmark[i]) {
      const t = LANDMARK_TINT;
      r = (r + t[0] * 2) / 3;
      g = (g + t[1] * 2) / 3;
      b = (b + t[2] * 2) / 3;
    }
    // HEIGHT shading: up is brighter, down is darker, so slopes read as
    // gradients and a sublevel reads as a shadow across the plan.
    const h = s.floor ? s.floor[i] : 0;
    const lift = 1 + Math.max(-0.55, Math.min(0.4, h * 0.055));
    r = Math.min(255, r * lift);
    g = Math.min(255, g * lift);
    b = Math.min(255, b * lift);
    if (s.background && s.background[i]) [r, g, b] = SCENERY;
    if (s.floor && s.floor[i] <= -PIT_LETHAL) [r, g, b] = PIT;
    if (s.solid[i]) [r, g, b] = SOLID;
    rect(x * SCALE, y * SCALE, SCALE, SCALE, r, g, b);
    if (s.wallN[i]) rect(x * SCALE, y * SCALE, SCALE, 1, ...WALL);
    if (s.wallW[i]) rect(x * SCALE, y * SCALE, 1, SCALE, ...WALL);
  }
}
// Outer frame.
rect(0, W - 1, W, 1, ...WALL);
rect(W - 1, 0, 1, W, ...WALL);
// Doors as bright markers.
for (const d of s.doors) {
  rect(d.x * SCALE - 4, d.y * SCALE - 4, SCALE + 8, SCALE + 8, ...DOOR);
}

// ---- What a player hunts for: furniture, drives, THE DOOR and THE KEY ------
// Marked on the review render only — in game you find these by walking.
{
  const dyn = (...p) =>
    import(new URL("file:///" + path.join(here, "..", ...p).split(path.sep).join("/")));
  const { propsInChunk } = await dyn("dist", "backrooms", "props.js");
  const { driveSites, doorSite, keySite } = await dyn("dist", "backrooms", "lore.js");
  let props = 0;
  for (let cy = 0; cy < Math.ceil(size / 16); cy++) {
    for (let cx = 0; cx < Math.ceil(size / 16); cx++) {
      const list = propsInChunk(s, cx * 16, cy * 16, Math.min(16, size - cx * 16), Math.min(16, size - cy * 16));
      for (const pr of list) {
        props++;
        rect(Math.floor(pr.x) * SCALE, Math.floor(pr.y) * SCALE, SCALE, SCALE, 236, 154, 96);
      }
    }
  }
  const drives = driveSites(s);
  for (const d of drives) {
    rect(Math.floor(d.x) * SCALE - 2, Math.floor(d.y) * SCALE - 2, SCALE + 4, SCALE + 4, 120, 190, 255);
  }
  const door = doorSite(s, dist);
  const key = keySite(s, door);
  rect(Math.floor(door.x) * SCALE - 6, Math.floor(door.y) * SCALE - 6, SCALE + 12, SCALE + 12, 255, 58, 42);
  rect(Math.floor(key.x) * SCALE - 5, Math.floor(key.y) * SCALE - 5, SCALE + 10, SCALE + 10, 255, 214, 90);
  console.log(
    `overlay: ${props} props · ${drives.length} drives · door ${Math.floor(door.x)},${Math.floor(door.y)} · key ${Math.floor(key.x)},${Math.floor(key.y)}${key.landmark ? ` (${key.landmark})` : ""}`,
  );
}

writePng(`${outPrefix}.png`, W, W, img);

// ---- Depth heat map --------------------------------------------------------

const heat = Buffer.alloc(W * W * 4);
const putH = (px, py, r, g, b) => {
  const i = (py * W + px) * 4;
  heat[i] = r;
  heat[i + 1] = g;
  heat[i + 2] = b;
  heat[i + 3] = 255;
};
const maxD = report.maxDistFromDoors || 1;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let r = 16, g = 12, b = 10;
    // Pits and sealed scenery are non-solid but UNREACHABLE BY DESIGN — they
    // get their own colours so magenta keeps meaning "bug, go look".
    const isPit = s.floor && s.floor[i] <= -PIT_LETHAL;
    const isScenery = s.background && s.background[i] === 1;
    if (isPit) [r, g, b] = PIT;
    else if (isScenery) [r, g, b] = SCENERY;
    else if (!s.solid[i]) {
      const d = dist[i];
      if (d < 0) [r, g, b] = [255, 0, 255]; // unreachable — must never appear
      else {
        // Shallow = pale yellow → deep = ember red → deepest = near black.
        const t = d / maxD;
        r = Math.round(235 - 90 * t);
        g = Math.round(215 - 190 * t);
        b = Math.round(140 - 130 * t);
      }
    }
    for (let py = 0; py < SCALE; py++) for (let px = 0; px < SCALE; px++) putH(x * SCALE + px, y * SCALE + py, r, g, b);
  }
}
for (const d of s.doors) {
  for (let py = -4; py < SCALE + 4; py++) {
    for (let px = -4; px < SCALE + 4; px++) {
      const X = d.x * SCALE + px, Y = d.y * SCALE + py;
      if (X >= 0 && Y >= 0 && X < W && Y < W) putH(X, Y, 92, 220, 120);
    }
  }
}
writePng(`${outPrefix}-heat.png`, W, W, heat);

// ---- Report ----------------------------------------------------------------

console.log(`seed ${seed} size ${size} → ${outPrefix}.png / -heat.png`);
console.log(JSON.stringify(report, null, 2));
console.log("landmarks:");
for (const l of s.landmarks) console.log(`  ${l.name} @ (${l.x},${l.y}) ${l.w}x${l.h}`);
console.log("doors:");
for (const d of s.doors) console.log(`  ${d.name} @ (${d.x},${d.y})`);
