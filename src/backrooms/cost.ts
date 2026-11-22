// THE COST METER (Josh, Oct 2026: "props and triangles per area, so a room
// heavy enough to stutter the game shows up while you're building it").
//
// What a prop costs the game to draw is read from the BUILT model files
// (scripts/props/cost.mjs → props-cost.json): draw calls and triangles. The
// map editor adds them up per room and per 16-cell square of the level (the
// game streams the world in squares that size, service.ts CHUNK).
//
// THE BUDGET IS MEASURED, NOT GUESSED: it is the busiest 16×16 patch, at any
// position, on any live level in October 2026 — Pipe Dreams, 180 draw calls
// and 130,000 triangles — so "over budget" means heavier than anything
// players already play smoothly. A room's meter and the level's note both
// measure patches the same way (heaviestPatch / levelPatchMax), so a room
// that is live reads at or under 100% on both. Re-measure it
// (scripts/checks/test_mapeditor_tools.mjs prints the live maps' busiest
// patches) before moving it.
//
// Counts only what the editor PLACES (the kit props in rooms). The level's
// own built-in fittings are the same whatever the design, so they are not
// what a designer is choosing.

import COST_JSON from "./props-cost.json";
import { KIT } from "./kit";

export const COST_SQUARE = 16;
export const COST_BUDGET = { calls: 180, tris: 130_000 } as const;
/** A drawn sign or shape: one draw call, a box's worth of triangles. */
const DRAWN: [number, number] = [1, 12];

const FILES = (COST_JSON as unknown as { files: Record<string, [number, number]> }).files;

export interface Cost {
  props: number;
  calls: number;
  tris: number;
}

/** [draw calls, triangles] for one placed prop (id + variant, 1-based). */
export function propCost(p: string, v = 1): [number, number] {
  const prop = KIT.get(p);
  if (!prop) return [0, 0];
  if (prop.builtin) return DRAWN;
  const variant = prop.variants[Math.max(0, Math.min(prop.variants.length - 1, (v || 1) - 1))];
  return (variant && FILES[variant.file]) ?? [0, 0];
}

/** What a list of placements costs together. */
export function costOf(list: readonly { p: string; v?: number }[]): Cost {
  const out: Cost = { props: 0, calls: 0, tris: 0 };
  for (const q of list) {
    const [c, t] = propCost(q.p, q.v);
    out.props++;
    out.calls += c;
    out.tris += t;
  }
  return out;
}

/** How full the budget is: 1 = as heavy as the heaviest live square today. */
export const costLoad = (c: Cost): number => Math.max(c.calls / COST_BUDGET.calls, c.tris / COST_BUDGET.tris);

/** A ROOM's busiest COST_SQUARE patch: the same yardstick as the level's
 *  squares (a big room's total is not, since it spreads over several). Every
 *  window position is tried, so whichever way a copy lands on the level's
 *  squares, none of them carries more of this room than this. */
export function heaviestPatch(list: readonly { p: string; v?: number; x: number; y: number }[], w: number, h: number): Cost {
  const ww = Math.min(COST_SQUARE, w);
  const wh = Math.min(COST_SQUARE, h);
  let best: Cost = { props: 0, calls: 0, tris: 0 };
  for (let y0 = 0; y0 <= Math.max(0, h - wh); y0++) {
    for (let x0 = 0; x0 <= Math.max(0, w - ww); x0++) {
      const inside = list.filter((q) => q.x >= x0 && q.x < x0 + ww && q.y >= y0 && q.y < y0 + wh);
      const c = costOf(inside);
      if (costLoad(c) > costLoad(best)) best = c;
    }
  }
  return best;
}

/** The level's busiest COST_SQUARE patch at ANY position (not just on the
 *  squares' grid) — what a room's heaviestPatch is compared against. Summed
 *  tables over the cells, so a 288-cell level costs a few milliseconds. */
export function levelPatchMax(kit: readonly (readonly [string, number, number, number, ...unknown[]])[], size: number): Cost {
  const N = size;
  const W = N + 1;
  const sum = (pick: (c: [number, number]) => number): Float64Array => {
    const cell = new Float64Array(N * N);
    for (const [p, v, x, y] of kit) {
      const cx = Math.min(N - 1, Math.max(0, Math.floor(x)));
      const cy = Math.min(N - 1, Math.max(0, Math.floor(y)));
      cell[cy * N + cx] += pick(propCost(p, v));
    }
    const a = new Float64Array(W * W);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) a[(y + 1) * W + x + 1] = cell[y * N + x] + a[(y + 1) * W + x] + a[y * W + x + 1] - a[y * W + x];
    return a;
  };
  const calls = sum((c) => c[0]);
  const tris = sum((c) => c[1]);
  const props = (() => {
    const one = new Float64Array(N * N);
    for (const [, , x, y] of kit) one[Math.min(N - 1, Math.max(0, Math.floor(y))) * N + Math.min(N - 1, Math.max(0, Math.floor(x)))]++;
    const a = new Float64Array(W * W);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) a[(y + 1) * W + x + 1] = one[y * N + x] + a[(y + 1) * W + x] + a[y * W + x + 1] - a[y * W + x];
    return a;
  })();
  const q = Math.min(COST_SQUARE, N);
  const box = (a: Float64Array, x: number, y: number): number => a[(y + q) * W + x + q] - a[y * W + x + q] - a[(y + q) * W + x] + a[y * W + x];
  let best: Cost = { props: 0, calls: 0, tris: 0 };
  for (let y = 0; y + q <= N; y++) {
    for (let x = 0; x + q <= N; x++) {
      const c = { props: box(props, x, y), calls: box(calls, x, y), tris: box(tris, x, y) };
      if (costLoad(c) > costLoad(best)) best = c;
    }
  }
  return best;
}

/** The level's props added up per square: [p, v, x, y] in cells. */
export function squareCosts(kit: readonly (readonly [string, number, number, number, ...unknown[]])[], size: number): { n: number; costs: Cost[] } {
  const n = Math.ceil(size / COST_SQUARE);
  const costs: Cost[] = Array.from({ length: n * n }, () => ({ props: 0, calls: 0, tris: 0 }));
  for (const [p, v, x, y] of kit) {
    const sx = Math.min(n - 1, Math.max(0, Math.floor(x / COST_SQUARE)));
    const sy = Math.min(n - 1, Math.max(0, Math.floor(y / COST_SQUARE)));
    const [c, t] = propCost(p, v);
    const q = costs[sy * n + sx];
    q.props++;
    q.calls += c;
    q.tris += t;
  }
  return { n, costs };
}
