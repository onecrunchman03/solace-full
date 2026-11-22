// Top-down Pipe Dreams renderer (sector D3: the route from the drain to the
// pressure door is outlined in dashed amber) — the map-review tool for Level 2.
//
//   node scripts/render-pipes.mjs [seed] [outPrefix]
//
// Drawn as a FLOOR PLAN: the three decks are three tones of concrete, each
// room type carries a faint tint (galleries sandy, corridors pale, tunnels
// dark, safe rooms green, engine pits sunk dark with rust catwalks), walls are
// white lines, doors are the gaps. Machines blue-grey, tanks and boilers
// copper, racks brown, furniture small marks against their walls; lamps
// yellow (dead = dim), vents red, stairs amber, prop locked doors magenta,
// the drain cyan and the pressure door red. A second image is the reachability
// heat map (magenta = stranded, which must never appear). Build first.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dyn = (...p) => import(new URL("file:///" + path.join(here, "..", ...p).split(path.sep).join("/")));
const { planPipesSector, validatePipesSector, distanceMap, PDECO, SECTOR_D, BAND, MACHINES, TANKS } = await dyn("dist", "backrooms", "worldgen-pipes.js");

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
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

const seed = Number(process.argv[2] ?? SECTOR_D.seed);
const outPrefix = process.argv[3] ?? path.join(here, "..", "docs", "backrooms", `pipes-${seed}`);
const plan = planPipesSector(seed);
const s = plan.sector;
const size = s.size;
const report = validatePipesSector(s);
const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));

const SCALE = 5;
const W = size * SCALE;
const img = Buffer.alloc(W * W * 4);
const put = (px, py, r, g, b) => {
  if (px < 0 || py < 0 || px >= W || py >= W) return;
  const i = (py * W + px) * 4;
  img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = 255;
};
const rect = (px, py, w, h, c) => { for (let y = py; y < py + h; y++) for (let x = px; x < px + w; x++) put(x, y, ...c); };

// Room-type tints, added to the deck tone.
const TINT = {
  pipegallery: [26, 18, 0],
  servicering: [14, 10, 0],
  corridor: [34, 34, 30],
  tunnel: [-22, -24, -26],
  office: [4, 4, 8],
  suite: [0, 10, 18],
  breakroom: [-40, 40, -30],
  controlroom: [-40, 40, -10],
  drainroom: [-50, 30, 60],
  enginehall: [-20, -24, -28],
  catwalk: [60, 10, -30],
  boilerhouse: [20, -4, -14],
  warehouse: [10, 6, -4],
  machineshop: [-4, 6, 14],
  vault: [30, -20, -20],
};
const SOLID = [20, 20, 22];
const WALL = [232, 228, 218];
const typeAt = (i) => s.districts[s.district[i]].type;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const code = s.deco[i];
    const kind = code >> 4;
    const f = s.floor[i];
    // deck tone: top deck brightest; a pit a step darker than its deck
    const g = 92 + Math.round((f / BAND) * 22);
    const t = TINT[typeAt(i)] ?? [0, 0, 0];
    let c = [clamp(g + t[0]), clamp(g - 2 + t[1]), clamp(g - 6 + t[2])];
    if (kind === PDECO.stairs) c = [214, 168, 70];
    if (s.solid[i]) {
      c = SOLID;
      if (kind === PDECO.rack) c = [120, 92, 56];
    }
    rect(x * SCALE, y * SCALE, SCALE, SCALE, c);
  }
}
// Solid footprints drawn whole from their anchors.
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const code = s.deco[y * size + x];
    const kind = code >> 4;
    if (kind !== PDECO.machine && kind !== PDECO.tank) continue;
    const fp = (kind === PDECO.machine ? MACHINES : TANKS)[code & 15];
    const col = kind === PDECO.machine ? (fp.name === "turbine" ? [70, 110, 150] : [96, 116, 136]) : [168, 96, 52];
    rect(x * SCALE + 1, y * SCALE + 1, fp.w * SCALE - 2, fp.h * SCALE - 2, col);
  }
}
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (s.wallN[i]) rect(x * SCALE, y * SCALE, SCALE, 1, WALL);
    if (s.wallW[i]) rect(x * SCALE, y * SCALE, 1, SCALE, WALL);
    const code = s.deco[i];
    const kind = code >> 4;
    const v = code & 15;
    const px = x * SCALE;
    const py = y * SCALE;
    if (kind === PDECO.wallA || kind === PDECO.wallB) {
      // a bar against the wall it backs onto
      const side = v & 3;
      const col = kind === PDECO.wallA ? [[150, 150, 158], [176, 132, 80], [120, 124, 132], [70, 170, 170]][v >> 2] : [[150, 120, 80], [190, 190, 186], [110, 110, 90], [170, 110, 60]][v >> 2];
      if (side === 0) rect(px + 1, py + 1, SCALE - 2, 2, col);
      else if (side === 2) rect(px + 1, py + SCALE - 3, SCALE - 2, 2, col);
      else if (side === 3) rect(px + 1, py + 1, 2, SCALE - 2, col);
      else rect(px + SCALE - 3, py + 1, 2, SCALE - 2, col);
    }
    if (kind === PDECO.free) {
      const axis = v & 1;
      const col = [[150, 120, 90], [170, 140, 100], [160, 130, 90], [150, 120, 70], [80, 110, 70], [170, 150, 100], [110, 80, 60], [200, 200, 205]][v >> 1];
      if (axis === 0) rect(px + 1, py + 2, SCALE - 2, 1, col);
      else rect(px + 2, py + 1, 1, SCALE - 2, col);
    }
    if (kind === PDECO.lamp) rect(px + 2, py + 2, 1, 1, v === 1 ? [90, 80, 40] : v === 2 ? [255, 160, 60] : [255, 230, 100]);
    if (kind === PDECO.vent) rect(px + 1, py + 1, 3, 3, [240, 50, 40]);
    if (kind === PDECO.lockeddoor) rect(px, py, SCALE, SCALE, [220, 40, 170]);
    if (kind === PDECO.panel) rect(px, py, SCALE, SCALE, [255, 200, 0]);
  }
}
// The route from the drain to the door: a faint amber outline round each piece.
for (const id of plan.mainPath) {
  const inst = plan.insts[id];
  const c = [255, 170, 40];
  const x0 = inst.x * SCALE - 1, y0 = inst.y * SCALE - 1, x1 = (inst.x + inst.w) * SCALE, y1 = (inst.y + inst.h) * SCALE;
  for (let x = x0; x <= x1; x += 2) { put(x, y0, ...c); put(x, y1, ...c); }
  for (let y = y0; y <= y1; y += 2) { put(x0, y, ...c); put(x1, y, ...c); }
}
for (const d of s.doors) rect(d.x * SCALE - 8, d.y * SCALE - 8, SCALE + 16, SCALE + 16, [60, 200, 255]);
for (let i = 0; i < size * size; i++) {
  if ((s.deco[i] >> 4) === PDECO.exitdoor) rect((i % size) * SCALE - 8, ((i / size) | 0) * SCALE - 8, SCALE + 16, SCALE + 16, [255, 50, 50]);
}
writePng(`${outPrefix}.png`, W, W, img);

const heat = Buffer.alloc(W * W * 4);
const maxD = report.maxDistFromDoors || 1;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let c = [16, 12, 10];
    if (!s.solid[i]) {
      const d = dist[i];
      if (d < 0) c = [255, 0, 255];
      else {
        const t = d / maxD;
        c = [250 - 180 * t, 240 - 200 * t, 200 - 180 * t];
      }
    }
    for (let py = 0; py < SCALE; py++) for (let px = 0; px < SCALE; px++) {
      const j = ((y * SCALE + py) * W + x * SCALE + px) * 4;
      heat[j] = c[0]; heat[j + 1] = c[1]; heat[j + 2] = c[2]; heat[j + 3] = 255;
    }
  }
}
writePng(`${outPrefix}-heat.png`, W, W, heat);

const { districts, doorReach, decoByKind, ...rest } = report;
const kinds = {};
for (const r of plan.rooms) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
const tiles = {};
for (const i of plan.insts) tiles[i.tileId] = (tiles[i.tileId] ?? 0) + 1;
console.log(JSON.stringify({
  ...rest,
  doorReach,
  route: plan.mainPath.map((id) => plan.insts[id].tileId).join(" > "),
  pieces: plan.insts.length,
  tiles,
  rooms: kinds,
  loops: plan.loops,
  safeAdded: plan.safeAdded,
  lostCells: plan.lostCells,
  districtCount: s.districts.length,
  landmarks: s.landmarks.map((l) => l.name),
  decoByKind,
}, null, 1));
