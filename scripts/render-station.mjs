// The Electrical Station, rendered — a review picture of the frozen map (or
// any seed): rooms coloured by type, each SECTION tinted, the walls, and what
// plays — the pressure door (green), the lift shutter (magenta), the six
// breakers (red, numbered by section) and cutoffs (orange), arcing panels
// (yellow), live water (blue), lamps (white dots; dead ones grey).
//
//   npm run build && node scripts/render-station.mjs [seed]
//   → docs/backrooms/station-<seed>.png
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const sharp = require("sharp");
const W = require(path.join(ROOT, "dist", "backrooms", "worldgen-station.js"));
const V = require(path.join(ROOT, "dist", "backrooms", "station-vocab.js"));

const seed = Number(process.argv[2] ?? W.SECTOR_S.seed);
const plan = W.planStationSector(seed, W.SECTOR_S.size);
const s = plan.sector;
const N = s.size;
const P = 7; // pixels per cell
const img = Buffer.alloc(N * P * N * P * 3);
const put = (px, py, [r, g, b]) => {
  if (px < 0 || py < 0 || px >= N * P || py >= N * P) return;
  const o = (py * N * P + px) * 3;
  img[o] = r;
  img[o + 1] = g;
  img[o + 2] = b;
};
const TYPE_RGB = {
  intake: [96, 140, 96], lifthall: [150, 90, 150], switchroom: [150, 110, 80], serviceway: [92, 92, 100],
  cablevault: [80, 76, 70], controldesk: [110, 120, 140], batteryroom: [100, 110, 90], xfmrbay: [120, 105, 80],
  substation: [128, 118, 100], workshop: [118, 100, 84], floodroom: [84, 104, 118],
};
const SECTION_TINT = [[0, 0, 0], [40, 0, 0], [0, 36, 0], [0, 0, 44], [36, 30, 0], [32, 0, 36], [0, 30, 32]];
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let rgb = [18, 18, 20];
    if (!s.solid[i]) {
      const base = TYPE_RGB[s.districts[s.district[i]]?.type] ?? [100, 100, 100];
      const t = SECTION_TINT[s.section?.[i] ?? 0];
      rgb = base.map((v, k) => Math.min(255, v + t[k]));
    }
    for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P + dy, rgb);
    const d = s.deco?.[i] ?? 0;
    const k = d >> 4;
    const v = d & 15;
    const mark = (rgb2, inset = 1) => {
      for (let dy = inset; dy < P - inset; dy++) for (let dx = inset; dx < P - inset; dx++) put(x * P + dx, y * P + dy, rgb2);
    };
    if (k === V.SDECO.puddle) mark([40, 110, 230], 0);
    else if (k === V.SDECO.lamp) mark(v === 1 ? [90, 90, 90] : v === 2 ? [230, 230, 150] : [245, 245, 245], 2);
    else if (k === V.SDECO.arc) mark([255, 230, 40]);
    else if (k === V.SDECO.breaker) mark([235, 40, 40], 0);
    else if (k === V.SDECO.cutoff) mark([255, 140, 20], 0);
    else if (k === V.SDECO.shutter) mark([255, 60, 220], 0);
    else if (k === V.SDECO.entrance) mark([60, 255, 90], 0);
  }
// walls
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (s.wallN[i]) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P, [8, 8, 8]);
    if (s.wallW[i]) for (let dy = 0; dy < P; dy++) put(x * P, y * P + dy, [8, 8, 8]);
  }
for (const d of s.doors) for (let dy = -1; dy <= P; dy++) for (let dx = -1; dx <= P; dx++) if (dx < 0 || dy < 0 || dx >= P || dy >= P) put(d.x * P + dx, d.y * P + dy, [60, 255, 90]);
mkdirSync(path.join(ROOT, "docs", "backrooms"), { recursive: true });
const out = path.join(ROOT, "docs", "backrooms", `station-${seed}.png`);
await sharp(img, { raw: { width: N * P, height: N * P, channels: 3 } }).png().toFile(out);
const r = W.validateStationSector(s);
console.log(`${out}\n  ${plan.insts.length} rooms · ${r.breakers} breakers · ${r.cutoffs} cutoffs · ${r.arcPanels} arcing panels · ${r.puddleCells} water cells · ${r.lamps} lamps · reach ${r.reachablePct}% · lost ${plan.lostCells} · cuts ${plan.cuts}`);
