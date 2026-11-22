// THE POOLROOMS REDESIGN CANDIDATES (Josh, July 2026): "it needs to feel
// completely different from the backrooms map… NO mazes at all, much higher
// ceilings, big focus on incorporating water in many rooms, 2-3-4 story
// structures in massive rooms and having floors tied together with
// staircases. intricate structures."
//
// Reference grounding (researched): Jared Pike's Dream Pools — staircases
// descending INTO water, water rising through multi-storey volumes,
// monumental white-tile geometry; the POOLS game — pacing between vast open
// halls and flooded passages. No corridor is ever maze-grain here: the
// connective tissue is galleries and causeways you can see down.
//
// THREE CANDIDATES from shared building blocks, for the vote:
//   "lido"    — THE GRAND LIDO: cathedral pool courts, gallery terraces
//               around every basin, cascade courts, The Ziggurat.
//   "cistern" — THE CISTERN SEA: the whole floor is a wading sea; island
//               platforms carry stepped towers, tied by raised causeways.
//   "atrium"  — THE INFINITE ATRIUM: mega-rooms each holding a freestanding
//               pavilion with ROOFTOP POOLS (water above your head), grand
//               stairs between every level.
//
// Engine honesty: the world is a heightfield (one walkable surface), so a
// "story" is a stepped terrace you climb around the outside of — you never
// walk UNDER a floor someone walks on. True mezzanines are a later engine
// change if the winning design wants them.

import {
  type Sector,
  type District,
  type Door,
  type Protected,
  WATER_NONE,
  PIT_LETHAL,
  idx,
  rngFor,
  wallRect,
  smoothSlopes,
  connectAll,
  connectDoors,
  regradeStranded,
  validateSector,
} from "./worldgen";
import { validatePoolsSector, type PoolsReport } from "./worldgen-pools";

export type PoolCandidate = "lido" | "cistern" | "atrium";

interface WaterSeed {
  x: number;
  y: number;
  level: number;
}
interface Ctx {
  seeds: WaterSeed[];
  keep: Protected;
}

// ---- Shared building blocks --------------------------------------------------

/** Vertical-edged basin with a graded step strip on one side (v1's proven
 *  shape). `deck` = surrounding height in steps. */
function basin(s: Sector, ctx: Ctx, x: number, y: number, w: number, h: number, depth: number, deck: number, rnd: () => number): void {
  if (w < 4 || h < 4) return;
  const size = s.size;
  const side = Math.floor(rnd() * 4);
  const stepW = Math.min(3, side < 2 ? w : h);
  const stepAt = side < 2 ? x + 1 + Math.floor(rnd() * Math.max(1, w - stepW - 1)) : y + 1 + Math.floor(rnd() * Math.max(1, h - stepW - 1));
  for (let cy = y; cy < y + h; cy++) {
    for (let cx = x; cx < x + w; cx++) {
      if (cx < 1 || cy < 1 || cx >= size - 1 || cy >= size - 1) continue;
      const i = idx(size, cx, cy);
      if (s.solid[i]) continue;
      if (cx > x) s.wallW[i] = 0;
      if (cy > y) s.wallN[i] = 0;
      let dpt = depth;
      if (side === 0 && cy - y < depth && cx >= stepAt && cx < stepAt + stepW) dpt = cy - y + 1;
      else if (side === 1 && y + h - 1 - cy < depth && cx >= stepAt && cx < stepAt + stepW) dpt = y + h - cy;
      else if (side === 2 && cx - x < depth && cy >= stepAt && cy < stepAt + stepW) dpt = cx - x + 1;
      else if (side === 3 && x + w - 1 - cx < depth && cy >= stepAt && cy < stepAt + stepW) dpt = x + w - cx;
      s.floor[i] = deck - Math.min(depth, dpt);
      ctx.keep.add(i);
    }
  }
  for (let cx = x - 1; cx <= x + w; cx++) {
    for (const cy of [y - 1, y + h]) {
      if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
      ctx.keep.add(idx(size, cx, cy));
    }
  }
  for (let cy = y; cy < y + h; cy++) {
    for (const cx of [x - 1, x + w]) {
      if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
      ctx.keep.add(idx(size, cx, cy));
    }
  }
  // FIVE seeds — center + inset corners. A later stamp (a tower rising from
  // the lake) can bury the center seed; any surviving corner still floods
  // the water around it (the dry-Ziggurat-lake lesson).
  ctx.seeds.push({ x: x + (w >> 1), y: y + (h >> 1), level: deck - 1 });
  for (const [sx, sy] of [
    [x + 2, y + 2],
    [x + w - 3, y + 2],
    [x + 2, y + h - 3],
    [x + w - 3, y + h - 3],
  ] as [number, number][]) {
    ctx.seeds.push({ x: sx, y: sy, level: deck - 1 });
  }
}

/** A STEPPED TOWER — a ZIGGURAT. Every ring climbs one step through a
 *  stair FLIGHT, then holds a flat walkable PLATEAU (a story), then the next
 *  flight — so the whole structure is climb-legal from EVERY side by
 *  construction (the first spiral-staircase version left the upper terraces
 *  unreachable and the stranded-cell safety net flattened whole towers into
 *  their moats — the render showed pavilions drowned blue). The summit can
 *  carry a ROOFTOP POOL: water above the ground you started from, contained
 *  by its own rim. */
function steppedTower(
  s: Sector,
  ctx: Ctx,
  cx: number,
  cy: number,
  half: number,
  stories: number,
  rise: number, // steps per story (each climbed as `rise` one-step stair rings)
  deck: number,
  rooftopPool: boolean,
  rnd: () => number,
): void {
  const size = s.size;
  const plateau = 2; // flat rings per story — the walkable floor of each level
  const ringsPerStory = rise + plateau;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) continue;
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      const rel = half - ring;
      const storyIdx = Math.min(stories - 1, Math.floor(rel / ringsPerStory));
      const within = rel - storyIdx * ringsPerStory;
      const capped = Math.floor(rel / ringsPerStory) >= stories;
      const h = deck + (capped ? stories * rise : storyIdx * rise + Math.min(within, rise));
      const i = idx(size, x, y);
      s.floor[i] = h;
      s.solid[i] = 0;
      if (dx > -half) s.wallW[i] = 0;
      if (dy > -half) s.wallN[i] = 0;
      ctx.keep.add(i);
    }
  }
  const topH = deck + stories * rise;
  // Rooftop pool on the summit plateau, if it's broad enough for a rim.
  const summitHalf = half - stories * ringsPerStory;
  if (rooftopPool && summitHalf >= 4) {
    const ph = summitHalf - 1;
    basin(s, ctx, cx - ph, cy - ph, ph * 2, ph * 2, 2, topH, rnd);
  }
}

/** A raised CAUSEWAY between two points: a walkway at +`lift` steps, 2 wide,
 *  with 1-step staircase aprons at both ends. Runs axis-aligned L-shaped. */
function causeway(s: Sector, ctx: Ctx, x0: number, y0: number, x1: number, y1: number, lift: number): void {
  const size = s.size;
  const put = (x: number, y: number, h: number): void => {
    for (const [ox, oy] of [
      [0, 0],
      [1, 0],
    ] as [number, number][]) {
      const px = x + ox;
      const py = y + oy;
      if (px < 2 || py < 2 || px >= size - 2 || py >= size - 2) continue;
      const i = idx(size, px, py);
      s.floor[i] = h;
      s.solid[i] = 0;
      if (px > 0) s.wallW[i] = 0;
      if (py > 0) s.wallN[i] = 0;
      ctx.keep.add(i);
    }
  };
  const walk = (fx: number, fy: number, tx: number, ty: number, startH: number): number => {
    let h = startH;
    const sx = Math.sign(tx - fx);
    let cxw = fx;
    while (cxw !== tx) {
      put(cxw, fy, Math.min(lift, h));
      if (h < lift) h++;
      cxw += sx;
    }
    const sy = Math.sign(ty - fy);
    let cyw = fy;
    while (cyw !== ty) {
      put(tx, cyw, Math.min(lift, h));
      if (h < lift) h++;
      cyw += sy;
    }
    return h;
  };
  walk(x0, y0, x1, y1, 0);
  // The far end steps back down: overwrite the last `lift` cells descending.
  let h = lift;
  const sy = Math.sign(y0 - y1);
  let cyw = y1;
  while (h > 0 && cyw !== y0) {
    put(x1, cyw, h);
    h--;
    cyw += sy;
  }
}

/** Colonnade rows through a rect (columns every `pitch`). */
function colonnade(s: Sector, x: number, y: number, w: number, h: number, pitch: number): void {
  for (let cy = y + 2; cy < y + h - 2; cy += pitch) {
    for (let cx = x + 2; cx < x + w - 2; cx += pitch) {
      s.solid[idx(s.size, cx, cy)] = 1;
    }
  }
}

/** Cascade court: `tiers` terraces each dropping 2 steps, a basin on each. */
function cascade(s: Sector, ctx: Ctx, x: number, y: number, w: number, h: number, tiers: number, rnd: () => number): void {
  const size = s.size;
  const band = Math.floor(w / tiers);
  for (let tIdx = 0; tIdx < tiers; tIdx++) {
    const deck = (tiers - 1 - tIdx) * 2;
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x + tIdx * band; cx < Math.min(x + (tIdx + 1) * band, x + w); cx++) {
        if (cx < 2 || cy < 2 || cx >= size - 2 || cy >= size - 2) continue;
        s.floor[idx(size, cx, cy)] = deck;
      }
    }
    const bw = Math.min(band - 4, 12);
    const bh = Math.min(h - 6, 12);
    if (bw >= 5 && bh >= 5) {
      basin(s, ctx, x + tIdx * band + 2, y + ((h - bh) >> 1), bw, bh, 2, deck, rnd);
    }
  }
}

const clear = (s: Sector, x: number, y: number, w: number, h: number): void => {
  for (let cy = y; cy < y + h; cy++) {
    for (let cx = x; cx < x + w; cx++) {
      if (cx < 0 || cy < 0 || cx >= s.size || cy >= s.size) continue;
      const i = idx(s.size, cx, cy);
      s.solid[i] = 0;
      if (cy > y) s.wallN[i] = 0;
      if (cx > x) s.wallW[i] = 0;
    }
  }
};

// ---- The candidates ------------------------------------------------------------

function blank(seed: number, size: number): { s: Sector; ctx: Ctx } {
  const s: Sector = {
    seed,
    size,
    wallN: new Uint8Array(size * size),
    wallW: new Uint8Array(size * size),
    solid: new Uint8Array(size * size),
    floor: new Int8Array(size * size),
    background: new Uint8Array(size * size),
    district: new Uint8Array(size * size),
    landmark: new Uint8Array(size * size),
    districts: [],
    landmarks: [],
    doors: [],
  };
  return { s, ctx: { seeds: [], keep: new Set() } };
}

/** BSP into LARGE courts (no maze grain — the minimum leaf is a hall). */
function courts(size: number, min: number, max: number, rnd: () => number): District[] {
  interface Rect { x: number; y: number; w: number; h: number }
  const leaves: Rect[] = [];
  const stack: Rect[] = [{ x: 0, y: 0, w: size, h: size }];
  while (stack.length) {
    const r = stack.pop()!;
    const canW = r.w > max || (r.w >= min * 2 && rnd() < 0.7);
    const canH = r.h > max || (r.h >= min * 2 && rnd() < 0.7);
    if (!canW && !canH) {
      leaves.push(r);
      continue;
    }
    if (canW && (!canH || r.w >= r.h)) {
      const at = Math.floor(r.w * (0.4 + rnd() * 0.2));
      stack.push({ x: r.x, y: r.y, w: at, h: r.h });
      stack.push({ x: r.x + at, y: r.y, w: r.w - at, h: r.h });
    } else {
      const at = Math.floor(r.h * (0.4 + rnd() * 0.2));
      stack.push({ x: r.x, y: r.y, w: r.w, h: at });
      stack.push({ x: r.x, y: r.y + at, w: r.w, h: r.h - at });
    }
  }
  return leaves.map((r, i) => ({ id: i, type: "natatorium" as const, ...r }));
}

/** Wide doorways between courts — GALLERIES, not maze doors: 4-6 cells of
 *  opening per shared border, sometimes two of them. */
function openCourts(s: Sector, rnd: () => number): void {
  for (const d of s.districts) {
    if (d.y + d.h < s.size) {
      const gaps = 1 + (d.w > 56 && rnd() < 0.6 ? 1 : 0);
      for (let g = 0; g < gaps; g++) {
        const gw = 4 + Math.floor(rnd() * 3);
        const at = d.x + 3 + Math.floor(rnd() * Math.max(1, d.w - gw - 6));
        for (let i = 0; i < gw; i++) s.wallN[idx(s.size, at + i, d.y + d.h)] = 0;
      }
    }
    if (d.x + d.w < s.size) {
      const gaps = 1 + (d.h > 56 && rnd() < 0.6 ? 1 : 0);
      for (let g = 0; g < gaps; g++) {
        const gw = 4 + Math.floor(rnd() * 3);
        const at = d.y + 3 + Math.floor(rnd() * Math.max(1, d.h - gw - 6));
        for (let i = 0; i < gw; i++) s.wallW[idx(s.size, d.x + d.w, at + i)] = 0;
      }
    }
  }
}

function placeDoorsAndFinish(s: Sector, ctx: Ctx, rnd: () => number, maxBody = 5200): void {
  // Four interior arrival rooms, max-min spread, dried + flattened.
  const NAMES = ["The Landing", "The Changing Rooms", "The Filtration Hall", "The High Dive"];
  const spots: { x: number; y: number; name: string }[] = [];
  for (const name of NAMES) {
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;
    for (let c = 0; c < 40; c++) {
      const x = 14 + Math.floor(rnd() * (s.size - 28));
      const y = 14 + Math.floor(rnd() * (s.size - 28));
      const score = spots.length ? Math.min(...spots.map((p) => (p.x - x) ** 2 + (p.y - y) ** 2)) : Infinity;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    if (best) spots.push({ ...best, name });
  }
  s.doors = spots.map((p): Door => ({ x: p.x, y: p.y, edge: "N", name: p.name }));
  for (const d of s.doors) {
    clear(s, d.x - 3, d.y - 3, 7, 7);
    for (let y = d.y - 3; y <= d.y + 3; y++) {
      for (let x = d.x - 3; x <= d.x + 3; x++) {
        if (x < 0 || y < 0 || x >= s.size || y >= s.size) continue;
        const i = idx(s.size, x, y);
        s.floor[i] = 0;
        ctx.keep.delete(i);
      }
    }
  }
  smoothSlopes(s, ctx.keep);
  connectAll(s);
  connectDoors(s, ctx.keep);
  regradeStranded(s);
  connectDoors(s, ctx.keep);
  connectDoors(s); // last resort: route THROUGH structures rather than strand a door
  regradeStranded(s); // rescue corridors regrade floors — sweep any new strands
  for (let x = 0; x < s.size; x++) s.wallN[idx(s.size, x, 0)] = 1;
  for (let y = 0; y < s.size; y++) s.wallW[idx(s.size, 0, y)] = 1;
  floodWater(s, ctx.seeds, maxBody);
}

/** Physical flood fill (v1's, verbatim rules: contained by construction,
 *  merge-settled, spill-repaired, drains stay dry). */
function floodWater(s: Sector, seeds: WaterSeed[], maxBody = 5200): void {
  const size = s.size;
  const water = new Int8Array(size * size).fill(WATER_NONE);
  s.water = water;
  const MAX_BODY = maxBody;
  const tryFlood = (seed: WaterSeed, level: number): number[] | null => {
    const si = idx(size, seed.x, seed.y);
    if (s.solid[si] || s.floor[si] >= level) return null;
    const cells: number[] = [];
    const seen = new Set<number>([si]);
    const queue = [si];
    while (queue.length) {
      const i = queue.pop()!;
      cells.push(i);
      if (cells.length > MAX_BODY) return null;
      const x = i % size;
      const y = (i / size) | 0;
      const edges: [number, number, boolean][] = [
        [x, y - 1, !s.wallN[i]],
        [x, y + 1, y + 1 < size && !s.wallN[idx(size, x, y + 1)]],
        [x - 1, y, !s.wallW[i]],
        [x + 1, y, x + 1 < size && !s.wallW[idx(size, x + 1, y)]],
      ];
      for (const [nx, ny, open] of edges) {
        if (!open || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = idx(size, nx, ny);
        if (seen.has(ni) || s.solid[ni]) continue;
        if (s.floor[ni] >= level) continue;
        if (s.floor[ni] <= -PIT_LETHAL) return null;
        seen.add(ni);
        queue.push(ni);
      }
    }
    return cells;
  };
  for (const seed of seeds) {
    for (let level = seed.level; level >= seed.level - 2; level--) {
      const cells = tryFlood(seed, level);
      if (!cells) continue;
      for (const i of cells) water[i] = water[i] === WATER_NONE ? level : Math.min(water[i], level);
      break;
    }
  }
  for (let guard = 0; guard < 8; guard++) {
    let changed = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = idx(size, x, y);
        if (water[i] === WATER_NONE) continue;
        const edges: [number, number, boolean][] = [
          [x, y - 1, !s.wallN[i]],
          [x, y + 1, y + 1 < size && !s.wallN[idx(size, x, y + 1)]],
          [x - 1, y, !s.wallW[i]],
          [x + 1, y, x + 1 < size && !s.wallW[idx(size, x + 1, y)]],
        ];
        for (const [nx, ny, open] of edges) {
          if (!open || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const ni = idx(size, nx, ny);
          if (water[ni] !== WATER_NONE && water[ni] < water[i]) {
            water[i] = water[ni];
            changed++;
          }
        }
      }
    }
    if (!changed) break;
  }
  for (let i = 0; i < water.length; i++) if (water[i] !== WATER_NONE && s.floor[i] >= water[i]) water[i] = WATER_NONE;
  for (let guard = 0; guard < 64; guard++) {
    let changed = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = idx(size, x, y);
        const w = water[i];
        if (w === WATER_NONE) continue;
        const edges: [number, number, boolean][] = [
          [x, y - 1, !s.wallN[i]],
          [x, y + 1, y + 1 < size && !s.wallN[idx(size, x, y + 1)]],
          [x - 1, y, !s.wallW[i]],
          [x + 1, y, x + 1 < size && !s.wallW[idx(size, x + 1, y)]],
        ];
        for (const [nx, ny, open] of edges) {
          if (!open || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const ni = idx(size, nx, ny);
          if (s.solid[ni] || water[ni] !== WATER_NONE) continue;
          if (s.floor[ni] <= -PIT_LETHAL) continue;
          if (s.floor[ni] < w) {
            water[ni] = w;
            changed++;
          }
        }
      }
    }
    if (!changed) break;
  }
  for (let i = 0; i < water.length; i++) if (water[i] !== WATER_NONE && s.floor[i] >= water[i]) water[i] = WATER_NONE;
}

export function generatePoolsCandidate(style: PoolCandidate, seed: number, size = 322): Sector {
  const { s, ctx } = blank(seed, size);
  const rnd = rngFor(seed, `pools2:${style}`);

  if (style === "lido") {
    // THE GRAND LIDO — cathedral courts, each a self-contained set piece.
    s.districts = courts(size, 56, 104, rnd);
    for (const d of s.districts) {
      for (let y = d.y; y < d.y + d.h; y++) {
        for (let x = d.x; x < d.x + d.w; x++) s.district[idx(size, x, y)] = d.id & 0xff;
      }
    }
    for (const d of s.districts) wallRect(s, d.x, d.y, d.w, d.h);
    let zigDone = false;
    for (const d of s.districts) {
      clear(s, d.x, d.y, d.w, d.h);
      const roll = rnd();
      if (!zigDone && d.w >= 80 && d.h >= 80) {
        // THE ZIGGURAT: a lake court with a five-story stepped tower.
        zigDone = true;
        basin(s, ctx, d.x + 6, d.y + 6, d.w - 12, d.h - 12, 3, 0, rnd);
        steppedTower(s, ctx, d.x + (d.w >> 1), d.y + (d.h >> 1), 21, 4, 2, -3, true, rnd);
      } else if (roll < 0.34) {
        // Gallery court: raised terrace ring, grand basin floor.
        const g = 5;
        for (let y = d.y; y < d.y + d.h; y++) {
          for (let x = d.x; x < d.x + d.w; x++) {
            const edge = Math.min(x - d.x, y - d.y, d.x + d.w - 1 - x, d.y + d.h - 1 - y);
            s.floor[idx(size, x, y)] = edge < g ? 4 : 0;
          }
        }
        // Stairs down from the gallery on all four sides.
        const cxm = d.x + (d.w >> 1);
        const cym = d.y + (d.h >> 1);
        for (const [dx, dy, sx, sy] of [
          [0, 1, cxm, d.y + g - 1],
          [0, -1, cxm, d.y + d.h - g],
          [1, 0, d.x + g - 1, cym],
          [-1, 0, d.x + d.w - g, cym],
        ] as [number, number, number, number][]) {
          for (let i2 = 0; i2 <= 4; i2++) {
            for (const wide of [-1, 0, 1]) {
              const px = dx === 0 ? sx + wide : sx + dx * i2;
              const py = dy === 0 ? sy + wide : sy + dy * i2;
              if (px < 0 || py < 0 || px >= size || py >= size) continue;
              s.floor[idx(size, px, py)] = Math.max(0, 4 - i2);
            }
          }
        }
        const m = g + 4;
        if (d.w - m * 2 >= 10 && d.h - m * 2 >= 10) {
          basin(s, ctx, d.x + m, d.y + m, Math.min(38, d.w - m * 2), Math.min(38, d.h - m * 2), 3, 0, rnd);
        }
        colonnade(s, d.x + g + 1, d.y + g + 1, d.w - g * 2 - 2, d.h - g * 2 - 2, 6);
      } else if (roll < 0.6) {
        cascade(s, ctx, d.x + 3, d.y + 3, d.w - 6, d.h - 6, 3 + (d.w > 70 ? 1 : 0), rnd);
      } else if (roll < 0.82) {
        // Twin-pool hall with a central colonnade spine.
        colonnade(s, d.x, d.y, d.w, d.h, 7);
        const bw = Math.min(20, (d.w - 14) >> 1);
        const bh = Math.min(24, d.h - 12);
        if (bw >= 6 && bh >= 6) {
          basin(s, ctx, d.x + 4, d.y + ((d.h - bh) >> 1), bw, bh, 2, 0, rnd);
          basin(s, ctx, d.x + d.w - bw - 4, d.y + ((d.h - bh) >> 1), bw, bh, 3, 0, rnd);
        }
      } else {
        // Dry promenade court with a small tower folly.
        colonnade(s, d.x, d.y, d.w, d.h, 8);
        steppedTower(s, ctx, d.x + (d.w >> 1), d.y + (d.h >> 1), 10, 2, 2, 0, rnd() < 0.6, rnd);
      }
    }
    openCourts(s, rnd);
  } else if (style === "cistern") {
    // THE CISTERN SEA — one flooded floor, islands, causeways.
    for (let i = 0; i < size * size; i++) s.floor[i] = -2;
    ctx.seeds.push({ x: size >> 1, y: size >> 1, level: -1 });
    // Column forest over the whole sea (sparse, monumental).
    const colRnd = rngFor(seed, "pools2:cols");
    for (let y = 6; y < size - 6; y += 9) {
      for (let x = 6; x < size - 6; x += 9) {
        if (colRnd() < 0.5) s.solid[idx(size, x + Math.floor(colRnd() * 3), y + Math.floor(colRnd() * 3))] = 1;
      }
    }
    // Islands: platforms at deck 0 with towers; remembered for causeways.
    const islands: { x: number; y: number; r: number }[] = [];
    for (let tries = 0; tries < 400 && islands.length < 15; tries++) {
      const r = 14 + Math.floor(rnd() * 8);
      const x = 20 + Math.floor(rnd() * (size - 40));
      const y = 20 + Math.floor(rnd() * (size - 40));
      if (islands.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 14)) continue;
      islands.push({ x, y, r });
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.hypot(dx, dy) > r) continue;
          const px = x + dx;
          const py = y + dy;
          if (px < 2 || py < 2 || px >= size - 2 || py >= size - 2) continue;
          const i = idx(size, px, py);
          // Shore grades -1 so the sea laps onto every island.
          s.floor[i] = Math.hypot(dx, dy) > r - 2 ? -1 : 0;
          s.solid[i] = 0;
        }
      }
      const stories = 2 + Math.floor(rnd() * 3); // 2-4 stories
      steppedTower(s, ctx, x, y, Math.min(r - 3, stories * 4 + 4), stories, 2, 0, rnd() < 0.7, rnd);
    }
    // Causeways stitch each island to its nearest neighbour or two.
    for (let a = 0; a < islands.length; a++) {
      const from = islands[a];
      const rest = islands.filter((_, b) => b !== a).sort((p, q) => Math.hypot(p.x - from.x, p.y - from.y) - Math.hypot(q.x - from.x, q.y - from.y));
      for (const to of rest.slice(0, 1 + (rnd() < 0.4 ? 1 : 0))) {
        causeway(s, ctx, from.x, from.y - from.r + 2, to.x, to.y, 3);
      }
    }
    // Deep trenches criss-cross the sea (fall in, wade out at the shores).
    for (let tIdx = 0; tIdx < 6; tIdx++) {
      const horiz = rnd() < 0.5;
      const at = 30 + Math.floor(rnd() * (size - 60));
      for (let t2 = 10; t2 < size - 10; t2++) {
        const x = horiz ? t2 : at;
        const y = horiz ? at : t2;
        const i = idx(size, x, y);
        if (s.solid[i] || s.floor[i] !== -2) continue;
        s.floor[i] = -4;
      }
    }
    s.districts = [{ id: 0, type: "natatorium", x: 0, y: 0, w: size, h: size }];
    s.district.fill(0);
  } else {
    // THE INFINITE ATRIUM — mega-rooms holding freestanding pavilions with
    // rooftop pools; wide galleries; cascades between rooms.
    s.districts = courts(size, 64, 118, rnd);
    for (const d of s.districts) {
      for (let y = d.y; y < d.y + d.h; y++) {
        for (let x = d.x; x < d.x + d.w; x++) s.district[idx(size, x, y)] = d.id & 0xff;
      }
    }
    for (const d of s.districts) wallRect(s, d.x, d.y, d.w, d.h);
    for (const d of s.districts) {
      clear(s, d.x, d.y, d.w, d.h);
      const cxm = d.x + (d.w >> 1);
      const cym = d.y + (d.h >> 1);
      const roll = rnd();
      if (roll < 0.5) {
        // The pavilion room: a 2-3 story structure with a rooftop pool,
        // moated by a wading pool, colonnade at the walls.
        colonnade(s, d.x, d.y, d.w, d.h, 8);
        // The moat ring hugs the pavilion: tower first-class, water lapping
        // its bottom flight (the tower's deck starts IN the moat).
        const towerHalf = Math.min(12, Math.floor(Math.min(d.w, d.h) / 4));
        const mHalf = Math.min(towerHalf + 6, (Math.min(d.w, d.h) >> 1) - 4);
        if (mHalf > towerHalf) {
          basin(s, ctx, cxm - mHalf, cym - mHalf, mHalf * 2, mHalf * 2, 2, 0, rnd);
        }
        steppedTower(s, ctx, cxm, cym, towerHalf, 2 + (rnd() < 0.5 ? 1 : 0), 2, -2, true, rnd);
      } else if (roll < 0.75) {
        cascade(s, ctx, d.x + 4, d.y + 4, d.w - 8, d.h - 8, 4, rnd);
      } else {
        // The flooded hall: POOLS-game pacing — a tight-feeling wade under
        // a vast ceiling, columns marching into the mist.
        for (let y = d.y + 2; y < d.y + d.h - 2; y++) {
          for (let x = d.x + 2; x < d.x + d.w - 2; x++) {
            const edge = Math.min(x - d.x, y - d.y, d.x + d.w - 1 - x, d.y + d.h - 1 - y);
            s.floor[idx(size, x, y)] = edge < 3 ? -Math.max(0, edge - 1) : -2;
          }
        }
        ctx.seeds.push({ x: cxm, y: cym, level: -1 });
        colonnade(s, d.x, d.y, d.w, d.h, 6);
      }
    }
    openCourts(s, rnd);
  }

  placeDoorsAndFinish(s, ctx, rngFor(seed, "pools2:doors"), style === "cistern" ? size * size : 9500);
  return s;
}

export function validateCandidate(s: Sector): PoolsReport {
  return validatePoolsSector(s);
}

export { validateSector };
