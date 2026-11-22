// The Abandoned Office, rendered — a review picture of the frozen map (or any
// seed): rooms coloured by type, each BLINK ZONE tinted, the walls, the kit
// props' footprints (dark), the lit floor (brighter), and what plays — the
// lift (green), the stairwell door (magenta), the keycard (red), windows
// (cyan), troffers (white dots; dead ones grey, flickering ones yellow).
//
//   npm run build && node scripts/render-office.mjs [seed]
//   → docs/backrooms/office-<seed>.png
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const sharp = require("sharp");
const W = require(path.join(ROOT, "dist", "backrooms", "worldgen-office.js"));
const V = require(path.join(ROOT, "dist", "backrooms", "office-vocab.js"));
const K = require(path.join(ROOT, "dist", "backrooms", "kit.js"));

const seed = Number(process.argv[2] ?? W.SECTOR_O.seed);
const plan = W.planOfficeSector(seed, W.SECTOR_O.size);
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
  liftlobby: [96, 140, 96], security: [150, 70, 70], stairwell: [150, 90, 150], hallway: [92, 92, 96],
  cubicles: [110, 104, 92], openplan: [124, 118, 106], conference: [100, 112, 132], corneroffice: [120, 100, 84],
  kitchenette: [130, 110, 80], copyroom: [110, 110, 120], records: [96, 100, 84], serverroom: [70, 80, 96],
  washroom: [90, 116, 120], reception: [118, 110, 120], supply: [100, 92, 84],
};
const ZONE_TINT = [[0, 0, 0], [24, 0, 0], [0, 22, 0], [0, 0, 28], [22, 18, 0], [20, 0, 22], [0, 18, 20], [18, 10, 0], [10, 0, 18]];
const lit = W.officeLitCells(s);
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let rgb = [18, 18, 20];
    if (!s.solid[i]) {
      const base = TYPE_RGB[s.districts[s.district[i]]?.type] ?? [100, 100, 100];
      const t = ZONE_TINT[s.section?.[i] ?? 0];
      const shade = lit[i] ? 1 : 0.55;
      rgb = base.map((v, k) => Math.min(255, Math.round((v + t[k]) * shade)));
    }
    for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P + dy, rgb);
  }
// the kit props' footprints
for (const pl of s.kit ?? []) {
  const e = K.kitBlocks(pl) ? K.kitExtents(pl) : null;
  if (!e) continue;
  for (let py = Math.floor((pl.y - e.ry) * P); py <= (pl.y + e.ry) * P; py++)
    for (let px = Math.floor((pl.x - e.rx) * P); px <= (pl.x + e.rx) * P; px++) put(px, py, [40, 36, 30]);
}
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const d = s.deco?.[i] ?? 0;
    const k = d >> 4;
    const v = d & 15;
    const mark = (rgb2, inset = 1) => {
      for (let dy = inset; dy < P - inset; dy++) for (let dx = inset; dx < P - inset; dx++) put(x * P + dx, y * P + dy, rgb2);
    };
    if (k === V.ODECO.lamp) mark(v === 1 ? [70, 70, 70] : v === 2 ? [230, 230, 150] : [245, 245, 245], 2);
    else if (k === V.ODECO.window) mark([60, 200, 230], 1);
    else if (k === V.ODECO.keycard) mark([240, 40, 40], 0);
    else if (k === V.ODECO.stairdoor) mark([255, 60, 220], 0);
    else if (k === V.ODECO.entrance) mark([60, 255, 90], 0);
  }
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (s.wallN[i]) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P, [8, 8, 8]);
    if (s.wallW[i]) for (let dy = 0; dy < P; dy++) put(x * P, y * P + dy, [8, 8, 8]);
  }
for (const d of s.doors) for (let dy = -1; dy <= P; dy++) for (let dx = -1; dx <= P; dx++) if (dx < 0 || dy < 0 || dx >= P || dy >= P) put(d.x * P + dx, d.y * P + dy, [60, 255, 90]);
mkdirSync(path.join(ROOT, "docs", "backrooms"), { recursive: true });
const out = path.join(ROOT, "docs", "backrooms", `office-${seed}.png`);
await sharp(img, { raw: { width: N * P, height: N * P, channels: 3 } }).png().toFile(out);
const r = W.validateOfficeSector(s);
console.log(`${out}\n  ${plan.insts.length} rooms · keycard ${r.keycard} · stairwell door ${r.stairdoor} · ${r.lamps} troffers (${r.deadLamps} dead) · lit ${(r.litShare * 100).toFixed(0)}% · ${r.windows} windows · ${r.zones} zones · reach ${r.reachablePct}% · lost ${plan.lostCells} · cuts ${plan.cuts}`);
