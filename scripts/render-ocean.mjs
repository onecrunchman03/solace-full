// Thalassophobia, rendered — a review picture of the frozen map (or any seed):
// the water shaded by depth (the streets mid blue, sunk roofs paler, the
// plaza and the Drop near black), dry roofs grey, the tower tan, buildings
// rising into the fog dark, the walls, and what plays — the hatch (green), the
// subway stair (magenta), the Diving Helmet (red, ringed white) among the other
// helmet spots (dark red), the tower's lamps (yellow dots).
//
//   npm run build && node scripts/render-ocean.mjs [seed]
//   → docs/backrooms/ocean-<seed>.png
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const sharp = require("sharp");
const W = require(path.join(ROOT, "dist", "backrooms", "worldgen-ocean.js"));
const V = require(path.join(ROOT, "dist", "backrooms", "ocean-vocab.js"));
const K = require(path.join(ROOT, "dist", "backrooms", "kit.js"));

const seed = Number(process.argv[2] ?? W.SECTOR_T.seed);
const plan = W.planOceanSector(seed, W.SECTOR_T.size);
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
const lerp = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let rgb = [28, 30, 32];
    if (!s.solid[i]) {
      const type = s.districts[s.district[i]]?.type;
      const f = s.floor[i];
      if (type === "seatower") rgb = [170, 150, 112];
      else if (f >= 0) rgb = [140, 144, 146];
      else rgb = lerp([120, 170, 190], [6, 14, 26], Math.min(1, -f / 50));
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
    const k = V.tdecoKind(s.deco?.[y * N + x] ?? 0);
    const mark = (rgb2, inset = 1) => {
      for (let dy = inset; dy < P - inset; dy++) for (let dx = inset; dx < P - inset; dx++) put(x * P + dx, y * P + dy, rgb2);
    };
    if (k === V.TDECO.lamp) mark([240, 220, 120], 2);
    else if (k === V.TDECO.helmet) mark([140, 30, 30], 1);
    else if (k === V.TDECO.subway) mark([255, 60, 220], 0);
    else if (k === V.TDECO.entrance) mark([60, 255, 90], 0);
  }
const ring = (x, y, rgb) => {
  for (let dy = -2; dy <= P + 1; dy++) for (let dx = -2; dx <= P + 1; dx++) if (dx < 0 || dy < 0 || dx >= P || dy >= P) put(x * P + dx, y * P + dy, rgb);
};
if (plan.helmet) {
  for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(plan.helmet.x * P + dx, plan.helmet.y * P + dy, [255, 40, 40]);
  ring(plan.helmet.x, plan.helmet.y, [255, 255, 255]);
}
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (s.wallN[i]) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P, [250, 250, 250]);
    if (s.wallW[i]) for (let dy = 0; dy < P; dy++) put(x * P, y * P + dy, [250, 250, 250]);
  }
for (const d of s.doors) ring(d.x, d.y, [60, 255, 90]);
if (plan.subway) ring(plan.subway.x, plan.subway.y, [255, 60, 220]);
mkdirSync(path.join(ROOT, "docs", "backrooms"), { recursive: true });
const out = path.join(ROOT, "docs", "backrooms", `ocean-${seed}.png`);
await sharp(img, { raw: { width: N * P, height: N * P, channels: 3 } }).png().toFile(out);
const r = W.validateOceanSector(s);
console.log(`${out}\n  ${plan.insts.length} blocks · helmet spots ${r.helmetSpots} (the helmet at ${plan.helmet?.x},${plan.helmet?.y}) · subway at ${plan.subway?.x},${plan.subway?.y} floor ${r.subwayFloor} · wet ${r.wetCells} (drop ${r.dropCells}) · dry ${r.dryCells} · reach ${r.reachablePct}% · lost ${plan.lostCells}`);
