// The Terror Hotel, rendered — a review picture of the frozen map (or any
// seed): rooms coloured by type, the Boiler Room tinted red, the walls, the
// kit props' footprints (dark), and what plays — the service stair (green),
// the rusty door (magenta), the register (gold), the Boiler Key spots (red;
// the one the register names ringed white), lifts (cyan), furnaces (orange),
// moth nests (violet), fixtures (white dots; dead ones grey, flickering
// yellow). Each suite's number is printed under the picture.
//
//   npm run build && node scripts/render-hotel.mjs [seed]
//   → docs/backrooms/hotel-<seed>.png
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const sharp = require("sharp");
const W = require(path.join(ROOT, "dist", "backrooms", "worldgen-hotel.js"));
const V = require(path.join(ROOT, "dist", "backrooms", "hotel-vocab.js"));
const K = require(path.join(ROOT, "dist", "backrooms", "kit.js"));

const seed = Number(process.argv[2] ?? W.SECTOR_H.seed);
const plan = W.planHotelSector(seed, W.SECTOR_H.size);
const s = plan.sector;
const N = s.size;
const P = 7;
const img = Buffer.alloc(N * P * N * P * 3);
const put = (px, py, [r, g, b]) => {
  if (px < 0 || py < 0 || px >= N * P || py >= N * P) return;
  const o = (py * N * P + px) * 3;
  img[o] = r;
  img[o + 1] = g;
  img[o + 2] = b;
};
const TYPE_RGB = {
  landing: [96, 140, 96], corridor: [120, 60, 52], lounge: [140, 110, 70], suite: [150, 96, 70], lifthall: [130, 120, 90],
  beverly: [176, 56, 56], linen: [80, 76, 72], dining: [140, 100, 80], library: [110, 84, 60], boilergate: [130, 80, 50],
  boiler: [110, 70, 46], pipeway: [92, 72, 56], coalstore: [50, 46, 44], rustydoor: [150, 90, 150],
};
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let rgb = [18, 16, 14];
    if (!s.solid[i]) rgb = TYPE_RGB[s.districts[s.district[i]]?.type] ?? [100, 100, 100];
    for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P + dy, rgb);
  }
for (const pl of s.kit ?? []) {
  const e = K.kitBlocks(pl) ? K.kitExtents(pl) : null;
  if (!e) continue;
  for (let py = Math.floor((pl.y - e.ry) * P); py <= (pl.y + e.ry) * P; py++)
    for (let px = Math.floor((pl.x - e.rx) * P); px <= (pl.x + e.rx) * P; px++) put(px, py, [40, 30, 24]);
}
const target = plan.suites[plan.target];
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const d = s.deco?.[i] ?? 0;
    const k = V.hdecoKind(d);
    const v = V.hdecoVar(d);
    const mark = (rgb2, inset = 1) => {
      for (let dy = inset; dy < P - inset; dy++) for (let dx = inset; dx < P - inset; dx++) put(x * P + dx, y * P + dy, rgb2);
    };
    const st = k === V.HDECO.sconce ? V.sconceState(v) : v;
    if (k === V.HDECO.lamp || k === V.HDECO.sconce) mark(st === 1 ? [70, 70, 70] : st === 2 ? [230, 230, 150] : [250, 240, 210], 2);
    else if (k === V.HDECO.key) mark([240, 40, 40], 0);
    else if (k === V.HDECO.register) mark([255, 210, 60], 0);
    else if (k === V.HDECO.lift) mark([60, 210, 230], 0);
    else if (k === V.HDECO.furnace) mark([255, 130, 30], 0);
    else if (k === V.HDECO.nest) mark([150, 70, 220], 1);
    else if (k === V.HDECO.rustydoor) mark([255, 60, 220], 0);
    else if (k === V.HDECO.entrance) mark([60, 255, 90], 0);
  }
if (target) for (let dy = -2; dy <= P + 1; dy++) for (let dx = -2; dx <= P + 1; dx++) if (dx < 0 || dy < 0 || dx >= P || dy >= P) put(target.x * P + dx, target.y * P + dy, [255, 255, 255]);
// the Boiler Room's line, tinted along its walls
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (s.wallN[i]) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P, [8, 6, 6]);
    if (s.wallW[i]) for (let dy = 0; dy < P; dy++) put(x * P, y * P + dy, [8, 6, 6]);
  }
for (const d of s.doors) for (let dy = -1; dy <= P; dy++) for (let dx = -1; dx <= P; dx++) if (dx < 0 || dy < 0 || dx >= P || dy >= P) put(d.x * P + dx, d.y * P + dy, [60, 255, 90]);
mkdirSync(path.join(ROOT, "docs", "backrooms"), { recursive: true });
const out = path.join(ROOT, "docs", "backrooms", `hotel-${seed}.png`);
await sharp(img, { raw: { width: N * P, height: N * P, channels: 3 } }).png().toFile(out);
const r = W.validateHotelSector(s);
console.log(`${out}\n  ${plan.insts.length} rooms · ${r.suites} suites · the register names No. ${target?.number} · ${r.lifts} lift doors · ${r.furnaces} furnaces · ${r.nests} nests · ${r.lamps} fixtures (${r.deadLamps} dead) · reach ${r.reachablePct}% · lost ${plan.lostCells} · crossings ${r.crossings}`);
console.log(`  suites: ${plan.suites.map((q) => q.number).join(", ")}`);
