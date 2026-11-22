// FURNITURE — the props scattered through Level 0 (Josh's art drop).
//
// Rules he set: sparse, sensible for where they land, NEVER blocking a path,
// clipping into the floor/wall/ceiling is fine — and (July 2026) YOU CANNOT
// WALK THROUGH THEM. That last one is what makes this file careful.
//
// While props were pure decoration, "never blocks a path" was free: something
// with no collider cannot obstruct anything. Solid props lose that, so the
// guarantee is now PROVEN AT PLACEMENT TIME by two rules:
//
//   1. ROOMS AND JUNCTIONS ONLY — a cell needs three open neighbours, so
//      furniture never lands mid-corridor.
//   2. NEVER ON A CUT CELL — `notACutCell` walks the local floor graph with the
//      candidate cell REMOVED and refuses the spot unless every neighbour is
//      still mutually reachable. So even in the worst case, where a prop seals
//      its whole cell, a way around already exists. The proof does not depend on
//      the collider being small, which means the radii below are free to be
//      tuned for feel without ever risking a soft-lock.
//
// The other decision that hasn't changed: PLACEMENT IS A PURE FUNCTION of the
// sector seed and the cell, so every client and every reboot agrees without a
// table in the database, and the furniture is as permanent as the walls. It is
// deliberately NOT part of the sector fingerprint: props affect nothing
// mechanical or economic, so they can be retuned without invalidating a frozen
// world — the cut-cell rule is what keeps that safe.
//
// Collision is CLIENT-SIDE ONLY (see controller.ts). Movement validation on the
// server ignores props on purpose: phasing through an armchair wins a cheater
// nothing, while a server that disagreed with the client by a few centimetres
// would spray correction frames every time someone brushed a desk.
//
// They still only appear where furniture makes SENSE: in rooms and junctions
// (never a corridor mid-run), on level floor (never on a ramp), off the
// entrance aprons, out of landmarks, out of shafts and out of sealed scenery.

import { isPitCell, type DistrictType, type Sector } from "./worldgen";
import { kitVariant, kitBlocks, kitExtents, kitSize, isShapeFile } from "./kit";

export type PropKind =
  | "desk"
  | "bookshelf"
  | "dustyshelf"
  | "table"
  | "bed"
  | "armchair"
  | "serving"
  | "lamp";

/** Which furniture belongs in which kind of district. A hospital bed in a
 *  sublevel reads as a story; a hospital bed in a grand hall reads as a bug. */
// Partial: the Poolrooms district types carry no Level-0 furniture (the pools
// are FURNISHED by their architecture — columns, basins, bridges).
const BY_DISTRICT: Partial<Record<DistrictType, PropKind[]>> = {
  offices: ["desk", "bookshelf", "lamp", "desk", "table"],
  sublevel: ["bed", "dustyshelf", "bookshelf", "lamp", "desk"],
  classic: ["armchair", "table", "lamp", "bookshelf", "serving"],
  halls: ["serving", "table", "armchair"],
  pillars: ["armchair", "table"],
  atrium: ["serving", "armchair", "table"],
  terraces: ["armchair", "table"],
  // A maze is empty on purpose — the rare shelf is the exception that sells it.
  warrens: ["dustyshelf"],
  manila: ["armchair", "dustyshelf", "table"],
  panelled: ["desk", "bookshelf", "armchair", "lamp"],
  storage: ["dustyshelf", "dustyshelf", "bookshelf"],
  // restrooms and the dark rooms are bare: tile has nothing to sit on, and a
  // lights-out room is scary because you can't see what isn't there.
};

/** Collision half-extent per kind, in CELLS (a cell is 2m). Props collide as
 *  axis-aligned boxes rather than cylinders: furniture is boxy, and box-vs-box
 *  on separated axes gives clean sliding instead of sticky corners. Sized by
 *  what the model actually looks like — a lamp is a pole, a bed is a bed. */
const PROP_RADIUS: Record<PropKind, number> = {
  lamp: 0.1,
  serving: 0.18,
  armchair: 0.2,
  table: 0.24,
  dustyshelf: 0.24,
  desk: 0.26,
  bookshelf: 0.26,
  bed: 0.3,
};

/** How far a prop with a wall at its back is pushed INTO that wall, in cells.
 *  Furniture belongs against a wall, and it widens the lane past it. */
const WALL_HUG = 0.2;

/** Per-ten-thousand chance a qualifying cell holds furniture. ~0.2% of open
 *  cells → about fifty pieces across the condensed 212² Level 0 (raised from
 *  12 in Sep 2026: a map a third the size, with bare restrooms and dark rooms
 *  among its types, came out at thirty): you find a room with a desk in it,
 *  not a furniture showroom. */
const DENSITY = 20;
/** Warrens get a tenth of that — see BY_DISTRICT. */
const SPARSE_TYPES: DistrictType[] = ["warrens"];

/** How far the cut-cell check is allowed to search for a way around. Generous
 *  for any real room; if a detour is longer than this the spot is REFUSED
 *  (conservative — an unsearched maybe counts as a no). */
const DETOUR_LIMIT = 14;

export interface PropPlacement {
  x: number;
  y: number;
  kind: PropKind;
  /** Radians; props with a back (shelves, desks) face away from their wall. */
  rot: number;
  /** Collision half-extent in cells. The client collides against this. */
  r: number;
  /** Per-axis half-extents (kit props — a long shelf is not a square). */
  rx?: number;
  ry?: number;
  /** Metres above its cell's floor (a bottle on a table). */
  z?: number;
  /** A sign's words (kind "kit:sign-…"). */
  text?: string;
  /** A kit prop's TILT in radians, applied after `rot` (three.js Euler
   *  order "YXZ": rotation.set(pitch, rot, roll)). kit.ts rx / rz. */
  pitch?: number;
  roll?: number;
  /** A SHAPE (kind "kit:shape-…"): its size in metres, its surface id and
   *  its colour (kit.ts sx/sy/sz, tex, col). */
  sx?: number;
  sy?: number;
  sz?: number;
  tex?: string;
  col?: string;
}

function hash32(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ b ^ (h >>> 13), 0xc2b2ae35);
  h = Math.imul(h ^ c ^ (h >>> 16), 0x27d4eb2f);
  return (h ^ (h >>> 15)) >>> 0;
}

const open = (s: Sector, x: number, y: number): boolean => {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return false;
  const i = y * s.size + x;
  return !s.solid[i] && !s.background[i];
};

/** Can you step between two ORTHOGONALLY adjacent cells? Walls and THE CLIMB
 *  RULE both apply — the same test worldgen's connectivity pass uses, because a
 *  detour that needs an impossible climb is not a detour. */
function stepOpen(s: Sector, x: number, y: number, nx: number, ny: number): boolean {
  if (!open(s, x, y) || !open(s, nx, ny)) return false;
  const n = s.size;
  if (ny === y - 1 && s.wallN[y * n + x]) return false;
  if (ny === y + 1 && s.wallN[ny * n + nx]) return false;
  if (nx === x - 1 && s.wallW[y * n + x]) return false;
  if (nx === x + 1 && s.wallW[y * n + nx]) return false;
  if (isPitCell(s, nx, ny)) return false; // a shaft is not a way around
  return Math.abs(s.floor[ny * n + nx] - s.floor[y * n + x]) <= 1;
}

const ORTHO: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** THE GUARANTEE. True when removing (bx,by) entirely leaves all of its
 *  neighbours mutually reachable — i.e. the cell carries no traffic that has
 *  nowhere else to go, so a prop standing there cannot block a path even if it
 *  filled the cell wall to wall. */
function notACutCell(s: Sector, bx: number, by: number): boolean {
  const nbrs = ORTHO.map(([dx, dy]) => [bx + dx, by + dy] as [number, number]).filter(([nx, ny]) =>
    stepOpen(s, bx, by, nx, ny),
  );
  if (nbrs.length < 2) return false; // a dead end: the only way out is through
  const want = new Set(nbrs.slice(1).map(([nx, ny]) => `${nx},${ny}`));
  const seen = new Set<string>([`${bx},${by}`]); // the prop's cell is CLOSED
  const start = nbrs[0];
  seen.add(`${start[0]},${start[1]}`);
  const queue: [number, number, number][] = [[start[0], start[1], 0]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y, d] = queue[head];
    want.delete(`${x},${y}`);
    if (!want.size) return true;
    if (d >= DETOUR_LIMIT) continue;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !stepOpen(s, x, y, nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny, d + 1]);
    }
  }
  return !want.size;
}

/** The furniture standing in ONE cell, or null. A pure function of the seed and
 *  the cell — the density roll is checked before any expensive test, so calling
 *  this per cell across a whole sector stays cheap. */
export function propAt(s: Sector, x: number, y: number): PropPlacement | null {
  if (!open(s, x, y)) return null;
  const i = y * s.size + x;
  if (s.landmark[i] || isPitCell(s, x, y)) return null;
  // Entrance aprons stay clear — the arrival room is the one place that should
  // look swept.
  if (s.doors.some((d) => Math.abs(d.x - x) < 7 && Math.abs(d.y - y) < 7)) return null;

  const d = s.districts[s.district[i]];
  const type: DistrictType = d?.type ?? "classic";
  const menu = BY_DISTRICT[type];
  if (!menu?.length) return null;

  const roll = hash32(s.seed, i, 0x9017) % 10000;
  const density = SPARSE_TYPES.includes(type) ? DENSITY / 10 : DENSITY;
  if (roll >= density) return null;

  // ROOMS AND JUNCTIONS ONLY: three open neighbours means you're in a room or
  // at a junction, never mid-corridor.
  const dirs: [number, number][] = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
  const reachable = dirs.filter(([nx, ny]) => open(s, nx, ny));
  if (reachable.length < 3) return null;

  // LEVEL GROUND ONLY: a desk halfway up a ramp looks broken.
  const here = s.floor[i];
  if (dirs.some(([nx, ny]) => open(s, nx, ny) && s.floor[ny * s.size + nx] !== here)) return null;

  // …and now the one that matters, since the thing is solid.
  if (!notACutCell(s, x, y)) return null;

  const kind = menu[hash32(s.seed, i, 0x51ed) % menu.length];
  // Face away from the nearest wall if there is one, so shelves and desks have
  // their backs where a back belongs — and sit back against it.
  const wall = dirs.findIndex(([nx, ny]) => !open(s, nx, ny));
  const rot =
    wall === 0 ? Math.PI // wall to the north → face south
    : wall === 1 ? 0
    : wall === 2 ? Math.PI / 2
    : wall === 3 ? -Math.PI / 2
    : ((hash32(s.seed, i, 0x3f21) % 360) * Math.PI) / 180;
  const hug: [number, number] =
    wall === 0 ? [0, -WALL_HUG]
    : wall === 1 ? [0, WALL_HUG]
    : wall === 2 ? [-WALL_HUG, 0]
    : wall === 3 ? [WALL_HUG, 0]
    : [0, 0];
  return {
    x: x + 0.5 + hug[0],
    y: y + 0.5 + hug[1],
    kind,
    rot,
    r: PROP_RADIUS[kind],
  };
}

/** Kit props by chunk, built once per sector (a map holds thousands; a chunk
 *  request must not scan them all). */
const kitBuckets = new WeakMap<Sector, Map<string, PropPlacement[]>>();
function kitBucketsOf(s: Sector, chunk: number): Map<string, PropPlacement[]> {
  let m = kitBuckets.get(s);
  if (m) return m;
  m = new Map();
  for (const pl of s.kit ?? []) {
    const v = kitVariant(pl);
    if (!v) continue;
    const k = `${Math.floor(pl.x / chunk)},${Math.floor(pl.y / chunk)}`;
    const blocks = kitBlocks(pl);
    const e = blocks ? kitExtents(pl) : { rx: 0, ry: 0 };
    // kind "kit:<file>" — the client loads /assets/propkit/<file>.gltf; the
    // yaw goes over as radians in three's sense (rotation.y = -r)
    const out: PropPlacement = { x: pl.x, y: pl.y, kind: `kit:${v.file}` as PropKind, rot: (-pl.r * Math.PI) / 180, r: 0, rx: e.rx, ry: e.ry, z: pl.z };
    if (pl.text) out.text = pl.text;
    if (pl.rx) out.pitch = (pl.rx * Math.PI) / 180;
    if (pl.rz) out.roll = (pl.rz * Math.PI) / 180;
    if (isShapeFile(v.file)) {
      const size = kitSize(pl)!;
      [out.sx, out.sy, out.sz] = size;
      if (pl.tex) out.tex = pl.tex;
    }
    if (pl.col) out.col = pl.col;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(out);
  }
  kitBuckets.set(s, m);
  return m;
}

/** Drop a sector's cached buckets — its kit list was just replaced in place
 *  (a props-only publish; service.ts swapKit). */
export function forgetKitBuckets(s: Sector): void {
  kitBuckets.delete(s);
}

/** Each chunk's kit as a comparable string, keyed "cx,cy" — what swapKit
 *  diffs to find the chunks a props-only publish actually changed. */
export function kitChunkSignatures(s: Sector, chunk: number): Map<string, string> {
  const out = new Map<string, string>();
  if (!s.kit?.length) return out;
  for (const [k, v] of kitBucketsOf(s, chunk)) out.set(k, JSON.stringify(v));
  return out;
}

/** The kit props standing in one chunk. */
export function kitInChunk(s: Sector, cx: number, cy: number, chunk: number): PropPlacement[] {
  if (!s.kit?.length) return [];
  return kitBucketsOf(s, chunk).get(`${cx},${cy}`) ?? [];
}

/** Every prop in one chunk. Called by chunkFor, so furniture streams with the
 *  geometry it stands on and obeys the same map-secrecy rule. */
export function propsInChunk(s: Sector, x0: number, y0: number, w: number, h: number): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const p = propAt(s, x, y);
      if (p) out.push(p);
    }
  }
  return out;
}
