// Lights Out, rendered — a review picture of the frozen map (or any seed):
// rooms coloured by type, the Wet End blue, the walls, the kit props'
// footprints (dark), and what plays — the stair (green), the sea hatch
// (magenta), the Handwheel (red, ringed white) among the other wheel spots
// (dark red), battery spots (yellow), and the dead fixtures (grey dots).
//
//   npm run build && node scripts/render-lights.mjs [seed]
//   → docs/backrooms/lights-<seed>.png
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const sharp = require("sharp");
const W = require(path.join(ROOT, "dist", "backrooms", "worldgen-lights.js"));
const V = require(path.join(ROOT, "dist", "backrooms", "lights-vocab.js"));
const K = require(path.join(ROOT, "dist", "backrooms", "kit.js"));

const seed = Number(process.argv[2] ?? W.SECTOR_L.seed);
const plan = W.planLightsSector(seed, W.SECTOR_L.size);
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
  stairfoot: [96, 140, 96], darkhall: [92, 92, 92], darkroom: [112, 110, 106], storeroom: [120, 108, 86], piperun: [96, 84, 72],
  cellblock: [104, 100, 116], rubble: [90, 80, 70], deadoffice: [116, 112, 96], wetway: [56, 88, 120], cistern: [44, 76, 116], seahatch: [150, 90, 150],
};
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let rgb = [14, 14, 14];
    if (!s.solid[i]) rgb = TYPE_RGB[s.districts[s.district[i]]?.type] ?? [100, 100, 100];
    for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P + dy, rgb);
  }
for (const pl of s.kit ?? []) {
  const e = K.kitBlocks(pl) ? K.kitExtents(pl) : null;
  if (!e) continue;
  for (let py = Math.floor((pl.y - e.ry) * P); py <= (pl.y + e.ry) * P; py++)
    for (let px = Math.floor((pl.x - e.rx) * P); px <= (pl.x + e.rx) * P; px++) put(px, py, [34, 30, 26]);
}
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const k = V.ldecoKind(s.deco?.[y * N + x] ?? 0);
    const mark = (rgb2, inset = 1) => {
      for (let dy = inset; dy < P - inset; dy++) for (let dx = inset; dx < P - inset; dx++) put(x * P + dx, y * P + dy, rgb2);
    };
    if (k === V.LDECO.lamp) mark([60, 60, 60], 2);
    else if (k === V.LDECO.wheel) mark([120, 30, 30], 1);
    else if (k === V.LDECO.battery) mark([230, 210, 60], 2);
    else if (k === V.LDECO.seahatch) mark([255, 60, 220], 0);
    else if (k === V.LDECO.entrance) mark([60, 255, 90], 0);
  }
const ring = (x, y, rgb) => {
  for (let dy = -2; dy <= P + 1; dy++) for (let dx = -2; dx <= P + 1; dx++) if (dx < 0 || dy < 0 || dx >= P || dy >= P) put(x * P + dx, y * P + dy, rgb);
};
if (plan.wheel) {
  for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(plan.wheel.x * P + dx, plan.wheel.y * P + dy, [255, 40, 40]);
  ring(plan.wheel.x, plan.wheel.y, [255, 255, 255]);
}
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (s.wallN[i]) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P, [6, 6, 6]);
    if (s.wallW[i]) for (let dy = 0; dy < P; dy++) put(x * P, y * P + dy, [6, 6, 6]);
  }
for (const d of s.doors) ring(d.x, d.y, [60, 255, 90]);
mkdirSync(path.join(ROOT, "docs", "backrooms"), { recursive: true });
const out = path.join(ROOT, "docs", "backrooms", `lights-${seed}.png`);
await sharp(img, { raw: { width: N * P, height: N * P, channels: 3 } }).png().toFile(out);
const r = W.validateLightsSector(s);
console.log(`${out}\n  ${plan.insts.length} rooms · wheel spots ${r.wheelSpots} (the wheel at ${plan.wheel?.x},${plan.wheel?.y}) · battery spots ${r.batterySpots} · ${r.lamps} dead fixtures · wet cells ${r.wetCells} · reach ${r.reachablePct}% · lost ${plan.lostCells}`);
