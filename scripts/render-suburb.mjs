// The Suburbs, rendered — a review picture of the frozen map (or any seed):
// road dark grey, sidewalks pale, yards green, houses tan, garages brown, the
// park bright green, Number 9 magenta, the light pools pale yellow, the walls,
// the manhole (green), the front door (magenta), the House Key (red, ringed
// white) among the other key spots (dark red), the streetlights (yellow dots).
//
//   npm run build && node scripts/render-suburb.mjs [seed]
//   → docs/backrooms/suburb-<seed>.png
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const sharp = require("sharp");
const W = require(path.join(ROOT, "dist", "backrooms", "worldgen-suburb.js"));
const V = require(path.join(ROOT, "dist", "backrooms", "suburb-vocab.js"));
const K = require(path.join(ROOT, "dist", "backrooms", "kit.js"));

const seed = Number(process.argv[2] ?? W.SECTOR_U.seed);
const plan = W.planSuburbSector(seed, W.SECTOR_U.size);
const s = plan.sector;
const N = s.size;
const P = 5;
const img = Buffer.alloc(N * P * N * P * 3);
const put = (px, py, [r, g, b]) => {
  if (px < 0 || py < 0 || px >= N * P || py >= N * P) return;
  const o = (py * N * P + px) * 3;
  img[o] = r;
  img[o + 1] = g;
  img[o + 2] = b;
};
const shade = (rgb, f) => rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * (1 + f * 0.12)))));
const COL = {
  manhole: [120, 160, 130],
  road: [60, 62, 66],
  sidewalk: [150, 150, 145],
  yard: [70, 110, 60],
  house: [190, 160, 120],
  garage: [130, 100, 80],
  park: [90, 160, 70],
  porch: [210, 110, 210],
};
const lit = W.suburbLitMap(s);
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let rgb = [22, 20, 18];
    if (!s.solid[i]) {
      const type = s.districts[s.district[i]]?.type;
      const f = s.floor[i];
      rgb = shade(COL[type] ?? [255, 0, 255], f); if (lit[i]) rgb = rgb.map((v, k) => Math.min(255, Math.round(v * 0.55 + [255, 240, 160][k] * 0.45)));
    }
    for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P + dy, rgb);
  }
for (const pl of s.kit ?? []) {
  const e = K.kitBlocks(pl) ? K.kitExtents(pl) : null;
  if (!e) continue;
  for (let py = Math.floor((pl.y - e.ry) * P); py <= (pl.y + e.ry) * P; py++)
    for (let px = Math.floor((pl.x - e.rx) * P); px <= (pl.x + e.rx) * P; px++) put(px, py, [60, 52, 44]);
}
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const k = V.udecoKind(s.deco?.[y * N + x] ?? 0);
    const mark = (rgb2, inset = 1) => {
      for (let dy = inset; dy < P - inset; dy++) for (let dx = inset; dx < P - inset; dx++) put(x * P + dx, y * P + dy, rgb2);
    };
    if (k === V.UDECO.lamp) mark([240, 220, 120], 2);
    else if (k === V.UDECO.key) mark([140, 30, 30], 1);
    else if (k === V.UDECO.frontdoor) mark([255, 60, 220], 0);
    else if (k === V.UDECO.entrance) mark([60, 255, 90], 0);
  }
const ring = (x, y, rgb) => {
  for (let dy = -2; dy <= P + 1; dy++) for (let dx = -2; dx <= P + 1; dx++) if (dx < 0 || dy < 0 || dx >= P || dy >= P) put(x * P + dx, y * P + dy, rgb);
};
if (plan.key) {
  for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(plan.key.x * P + dx, plan.key.y * P + dy, [255, 40, 40]);
  ring(plan.key.x, plan.key.y, [255, 255, 255]);
}
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (s.wallN[i]) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P, [250, 250, 250]);
    if (s.wallW[i]) for (let dy = 0; dy < P; dy++) put(x * P, y * P + dy, [250, 250, 250]);
  }
for (const d of s.doors) ring(d.x, d.y, [60, 255, 90]);
if (plan.frontDoor) ring(plan.frontDoor.x, plan.frontDoor.y, [255, 60, 220]);
mkdirSync(path.join(ROOT, "docs", "backrooms"), { recursive: true });
const out = path.join(ROOT, "docs", "backrooms", `suburb-${seed}.png`);
await sharp(img, { raw: { width: N * P, height: N * P, channels: 3 } }).png().toFile(out);
const r = W.validateSuburbSector(s);
console.log(`${out}
  ${plan.insts.length} rooms · key spots ${r.keySpots} (the key at ${plan.key?.x},${plan.key?.y}) · front door at ${plan.frontDoor?.x},${plan.frontDoor?.y} · lamps ${r.lamps} (lit ${r.litLamps}, ${r.litCells} lit cells) · indoor ${r.indoorCells} · facing ${plan.facing} · reach ${r.reachablePct}% · lost ${plan.lostCells}`);
