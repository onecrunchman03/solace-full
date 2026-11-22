// The Cave System, rendered — a review picture of the frozen map (or any
// seed): the Station's tile pale grey, the track bed and the river blue, the
// Caverns' rock tan (darker where the floor drops, near black down a chasm),
// the Burrower's passages red-brown and its crawlspaces dark red, the open
// grottos of the Deep olive, the walls, and what plays — the subway stair
// (green), the Chimney (magenta), the Climbing Rope (red, ringed white) among
// the other rope spots (dark red), the lamps (yellow dots).
//
//   npm run build && node scripts/render-cave.mjs [seed]
//   → docs/backrooms/cave-<seed>.png
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const sharp = require("sharp");
const W = require(path.join(ROOT, "dist", "backrooms", "worldgen-cave.js"));
const V = require(path.join(ROOT, "dist", "backrooms", "cave-vocab.js"));
const K = require(path.join(ROOT, "dist", "backrooms", "kit.js"));

const seed = Number(process.argv[2] ?? W.SECTOR_C.seed);
const plan = W.planCaveSector(seed, W.SECTOR_C.size);
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
  subwaystair: [200, 210, 200],
  platform: [190, 190, 184],
  trackbed: [70, 110, 150],
  concourse: [205, 200, 188],
  breach: [160, 150, 130],
  cavern: [160, 128, 92],
  gallery: [150, 118, 84],
  caveriver: [50, 100, 140],
  chasm: [140, 110, 80],
  grotto: [120, 128, 70],
  passage: [130, 70, 50],
  crawl: [110, 30, 30],
  chimney: [220, 120, 220],
};
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let rgb = [22, 20, 18];
    if (!s.solid[i]) {
      const type = s.districts[s.district[i]]?.type;
      const f = s.floor[i];
      rgb = f <= -V.CAVE_PIT ? [8, 6, 6] : shade(COL[type] ?? [255, 0, 255], f);
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
    const k = V.cdecoKind(s.deco?.[y * N + x] ?? 0);
    const mark = (rgb2, inset = 1) => {
      for (let dy = inset; dy < P - inset; dy++) for (let dx = inset; dx < P - inset; dx++) put(x * P + dx, y * P + dy, rgb2);
    };
    if (k === V.CDECO.lamp) mark([240, 220, 120], 2);
    else if (k === V.CDECO.rope) mark([140, 30, 30], 1);
    else if (k === V.CDECO.chimney) mark([255, 60, 220], 0);
    else if (k === V.CDECO.entrance) mark([60, 255, 90], 0);
  }
const ring = (x, y, rgb) => {
  for (let dy = -2; dy <= P + 1; dy++) for (let dx = -2; dx <= P + 1; dx++) if (dx < 0 || dy < 0 || dx >= P || dy >= P) put(x * P + dx, y * P + dy, rgb);
};
if (plan.rope) {
  for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++) put(plan.rope.x * P + dx, plan.rope.y * P + dy, [255, 40, 40]);
  ring(plan.rope.x, plan.rope.y, [255, 255, 255]);
}
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (s.wallN[i]) for (let dx = 0; dx < P; dx++) put(x * P + dx, y * P, [250, 250, 250]);
    if (s.wallW[i]) for (let dy = 0; dy < P; dy++) put(x * P, y * P + dy, [250, 250, 250]);
  }
for (const d of s.doors) ring(d.x, d.y, [60, 255, 90]);
if (plan.chimney) ring(plan.chimney.x, plan.chimney.y, [255, 60, 220]);
mkdirSync(path.join(ROOT, "docs", "backrooms"), { recursive: true });
const out = path.join(ROOT, "docs", "backrooms", `cave-${seed}.png`);
await sharp(img, { raw: { width: N * P, height: N * P, channels: 3 } }).png().toFile(out);
const r = W.validateCaveSector(s);
console.log(`${out}\n  ${plan.insts.length} rooms · rope spots ${r.ropeSpots} (the rope at ${plan.rope?.x},${plan.rope?.y}) · chimney at ${plan.chimney?.x},${plan.chimney?.y} · burrow ${r.burrowCells} (crawl ${r.crawlCells}) · wet ${r.wetCells} · chasms ${r.pitCount} · reach ${r.reachablePct}% · lost ${plan.lostCells}`);
