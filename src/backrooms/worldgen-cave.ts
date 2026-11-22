// LEVEL 8 — THE CAVE SYSTEM, BUILT FROM HAND-MADE ROOMS (sector C1).
//
// Josh, 2026-10-15: "1. A 2. A 3. A" — the subway breach, the climb, the
// Burrower. The design is BACKROOMS.md → "LEVEL 8 — THE CAVE SYSTEM".
//
// It is Lights Out's LATTICE (worldgen-lights.ts), in three bands:
//
//   1. THE LIBRARY. Every room is drawn in cave-rooms.json (the dialect:
//      cave-tiles.ts), a whole number of 8-cell modules, filled edge to edge,
//      a doorway slot in the middle of every module side. Each room is in the
//      Station, the Caverns or the Deep.
//   2. THE WAY IN — Level 7's subway stair — at the middle of one edge of the
//      map. THE STATION is the STATION_ROWS module rows along that edge, THE
//      DEEP the DEEP_ROWS rows along the OPPOSITE edge, THE CAVERNS between.
//   3. THE CHIMNEY as far into the Deep from the way in as fits.
//   4. THE LINES: the subway TRACK across the Station and the RIVER across the
//      Caverns, each one unbroken line of rooms from one side of the map to
//      the other, with no wall across it where two of its rooms meet (the
//      SEAMS). Track and river rooms go nowhere else.
//   5. THE MINIMUMS, then THE PACK, biggest first, exactly as Lights Out.
//   5. THE DOORWAYS: a spanning tree, then a share of the rest.
//   6. THE CLIMBING ROPE: of every rope spot the Caverns drew, one is chosen,
//      deep in the Caverns, so the walk with it through the Deep is the level.
//
// Walls are DERIVED (a wall between two rooms unless a joined slot opens it),
// and the reach check at the end must find nothing to seal. A chasm's drop is
// left open (it is a pit: it kills).

import { type Sector, type District, type DistrictType, type Door, rngFor, distanceMap, validateSector, sectorFingerprint, isPitCell, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { CAVE_TYPES, MODULE, SLOT_AT, STATION_ROWS, DEEP_ROWS, ZONE_STATION, ZONE_CAVERNS, ZONE_DEEP, CAVE_WET_TYPES, BURROW_TYPES, CRAWL_TYPES, CAVE_DOOR_NAME, CDECO, cdecoKind, ROPE_SPOTS_MIN, type CaveType } from "./cave-vocab";
import { type TileDef, type Tile, type Lint, tileVariants, type Side, DX, DY } from "./tiles";
import { lintCaveTile } from "./cave-tiles";
import { placeable } from "./placement";
import LIBRARY_JSON from "./cave-rooms.json";
import { seatWallProps } from "./kitseat";

/** The library as shipped. */
export const CAVE_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** SECTOR C2 (Oct 16 2026 — C1 was the first cut, retired when the Station
 *  was replanned in rows): seed and size, and the fingerprint below, are what
 *  the server boots and checks. 162 cells = 20 modules a side and a one-cell
 *  rim (Josh: "around 160²"). */
export const SECTOR_C = Object.freeze({ id: "C2", seed: 20261015, size: 162 });
/** Captured at freeze time; regenerating the Cave System must always produce this. */
export const SECTOR_C_FINGERPRINT = "sha256:fba66ab89553011e9016df7418233d9ed9c4307a1c7c0485130c94189101ea12";

/** THE STATION'S ROWS (depth from the way in, 0-based). The line is the
 *  third; the station's platforms run STATION_HALF modules either side of the
 *  stair's, the dead train along the middle TRAIN_HALF either side. */
export const LINE_ROW = 2;
export const STATION_HALF = 2;
export const TRAIN_HALF = 1;
/** Which Station rows a room may stand on, by its type and kind. */
export function stationRows(def: { type: string; kind: string }): readonly number[] {
  if (def.type === "subwaystair") return [0];
  if (def.type === "trackbed") return [LINE_ROW];
  if (def.type === "breach") return [3];
  if (def.kind === "hall") return [0, 1];
  if (def.kind === "corridor") return [1];
  return [0, 1, 3]; // service rooms: staff, plant, stores
}

/** How far along the line (modules) from the stair a Station room may stand. */
export function stationReach(def: { type: string; kind: string }): number {
  if (def.kind === "hall" || def.kind === "corridor") return STATION_HALF + 1;
  if (def.kind === "service") return STATION_HALF + 4;
  return Infinity;
}

/** Of the slots the spanning tree doesn't need, the share that open anyway:
 *  the Caverns loop; the Deep, much less (a cave narrows as it goes on). */
const EXTRA_OPEN = 0.45;
const EXTRA_OPEN_DEEP = 0.2;
/** The rope is drawn from the best share of the spots (by distance from the
 *  way in), so it is always deep in the Caverns, never the same. */
export const ROPE_TOP_SHARE = 0.35;

export interface CaveLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  mw: number;
  mh: number;
  set: string;
}

export function loadCaveLibrary(defs: readonly TileDef[] = CAVE_LIBRARY, lax = false): CaveLibEntry[] {
  const out: CaveLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintCaveTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`cave: room "${def.id}" is broken — ${l.errors[0]}`);
    const set = String(Array.isArray(def.set) ? def.set[0] : def.set);
    out.push({ def, base: l.tile, variants: l.errors.length ? [] : tileVariants(l.tile), lint: { errors: l.errors, warnings: l.warnings }, mw: l.tile.w / MODULE, mh: l.tile.h / MODULE, set });
  }
  return out;
}

export interface CaveInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  type: string;
  /** ZONE_STATION, ZONE_CAVERNS or ZONE_DEEP. */
  zone: number;
  mx: number;
  my: number;
  mw: number;
  mh: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A wall-backed piece on the map: the cell you stand on to use it, and the
 *  wall it is on. */
export interface WallSite {
  x: number;
  y: number;
  side: Side;
}

export interface CavePlan {
  sector: Sector;
  insts: CaveInst[];
  tiles: Tile[];
  /** The zone of every module (row-major). */
  zoneOfModule: number[];
  /** The Chimney's foot. */
  chimney: WallSite | null;
  /** Every spot the Climbing Rope may lie on, and the one it does. */
  ropeSpots: { x: number; y: number }[];
  rope: { x: number; y: number } | null;
  opened: number;
  tree: number;
  cuts: number;
  /** Open cells the reach check sealed — MUST be 0. */
  lostCells: number;
  /** Rooms the library asks for (min) that didn't fit. */
  unmet: string[];
}

const pickOf = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];

/** How many times the planner re-rolls a map that left something unmet. The
 *  re-roll is deterministic (attempt k salts every roll). */
export const PLAN_ATTEMPTS = 24;

export function planCaveSector(seed: number, size: number, library: readonly TileDef[] = CAVE_LIBRARY): CavePlan {
  let last: CavePlan | null = null;
  for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt++) {
    last = planOnce(seed, size, library, attempt);
    if (last.lostCells === 0 && !last.unmet.length && last.rope && last.chimney && last.ropeSpots.length >= ROPE_SPOTS_MIN) return last;
  }
  return last!;
}

function planOnce(seed: number, size: number, library: readonly TileDef[], attempt: number): CavePlan {
  const salt = (label: string): string => (attempt ? `${label}:${attempt}` : label);
  const lib = loadCaveLibrary(library);
  const byRole = (r: string): CaveLibEntry[] => lib.filter((e) => e.def.role === r);
  const start = byRole("start");
  const goal = byRole("goal");
  if (!start.length) throw new Error("cave: the library needs a start room (the one with the subway stair)");
  if (!goal.length) throw new Error("cave: the library needs a goal room (the one with the chimney)");
  const G = Math.floor((size - 2) / MODULE);
  const O = Math.floor((size - G * MODULE) / 2);
  const occ = new Int32Array(G * G).fill(-1);
  const insts: CaveInst[] = [];
  const tiles: Tile[] = [];
  const count = new Map<string, number>();
  const rnd = rngFor(seed, salt("cc1:pack"));

  // ---- THE ZONES: bands out from the way in — the Station, the Caverns, the Deep
  const edge = Math.floor(rnd() * 4) as Side;
  const depthOf = (mx: number, my: number): number => (edge === 0 ? my : edge === 2 ? G - 1 - my : edge === 3 ? mx : G - 1 - mx);
  const zoneOfModule: number[] = [];
  for (let my = 0; my < G; my++)
    for (let mx = 0; mx < G; mx++) {
      const d = depthOf(mx, my);
      zoneOfModule.push(d < STATION_ROWS ? ZONE_STATION : d >= G - DEEP_ROWS ? ZONE_DEEP : ZONE_CAVERNS);
    }
  const zoneOfSet = (set: string): number => (set === "station" ? ZONE_STATION : set === "deep" ? ZONE_DEEP : ZONE_CAVERNS);

  /** THE STATION'S ROWS (Josh, Oct 16 2026: the first cut was "very
   *  disorganized"). Out from the way in: the ticket halls, then the passages
   *  down to the platforms, then THE LINE (platforms either side of the track
   *  at the station, plain tunnel beyond), then the far side — staff and
   *  plant rooms, and the breaches into the caves. A Station room may stand
   *  only on its own rows (`stationRows`); everything else is unchanged. */
  const rowsOf = (e: CaveLibEntry): readonly number[] | null => (e.set === "station" ? stationRows(e.def) : null);
  // …and how far along from the stair it may stand (the halls and passages
  // are the station's, so they stay near it; plant rooms and breaches can be
  // anywhere along the tunnels). Set once the stair is down.
  let stairAlong = -1;
  /** Free, inside the grid, wholly inside the room's own zone — and, in the
   *  Station, wholly on the room's own rows. */
  const fits = (mx: number, my: number, mw: number, mh: number, set: string, e?: CaveLibEntry): boolean => {
    if (mx < 0 || my < 0 || mx + mw > G || my + mh > G) return false;
    const z = zoneOfSet(set);
    const rows = e ? rowsOf(e) : null;
    const reach = rows && stairAlong >= 0 ? stationReach(e!.def) : Infinity;
    for (let y = my; y < my + mh; y++)
      for (let x = mx; x < mx + mw; x++) {
        if (occ[y * G + x] >= 0 || zoneOfModule[y * G + x] !== z) return false;
        if (rows && !rows.includes(depthOf(x, y))) return false;
        if (Math.abs((edge === 0 || edge === 2 ? x : y) - stairAlong) > reach) return false;
      }
    return true;
  };
  const place = (e: CaveLibEntry, t: Tile, mx: number, my: number): CaveInst => {
    const id = insts.length;
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) occ[y * G + x] = id;
    const inst: CaveInst = { id, tileId: e.def.id, role: e.def.role, name: e.def.name ?? null, type: e.def.type, zone: zoneOfSet(e.set), mx, my, mw, mh, x: O + mx * MODULE, y: O + my * MODULE, w: t.w, h: t.h };
    insts.push(inst);
    tiles.push(t);
    count.set(e.def.id, (count.get(e.def.id) ?? 0) + 1);
    return inst;
  };
  const centreOf = (i: CaveInst): [number, number] => [i.mx + i.mw / 2, i.my + i.mh / 2];

  // ---- THE WAY IN: the middle of the chosen edge, on the outer wall
  let startInst: CaveInst | null = null;
  {
    const e = pickOf(rnd, start);
    const cands = e.variants.filter((t) => t.pieces.some((p) => p.k === "entrance" && p.o === edge));
    for (const t of cands) {
      const mw = t.w / MODULE;
      const mh = t.h / MODULE;
      const along = edge === 0 || edge === 2 ? G - mw : G - mh;
      const mid = Math.floor(along / 2);
      for (let off = 0; off <= along && !startInst; off++) {
        for (const sgn of off ? [1, -1] : [1]) {
          const a = mid + sgn * off;
          if (a < 0 || a > along) continue;
          const mx = edge === 3 ? 0 : edge === 1 ? G - mw : a;
          const my = edge === 0 ? 0 : edge === 2 ? G - mh : a;
          if (fits(mx, my, mw, mh, e.set)) {
            startInst = place(e, t, mx, my);
            break;
          }
        }
      }
      if (startInst) break;
    }
    if (!startInst) throw new Error("cave: nowhere on the map's edge fits the subway stair");
    stairAlong = edge === 0 || edge === 2 ? startInst.mx : startInst.my;
  }
  // ---- THE CHIMNEY: as far into the Deep from the way in as fits, and off to
  // one side rather than dead ahead
  {
    const [sx, sy] = centreOf(startInst);
    let best: { e: CaveLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
    for (const e of goal)
      for (const t of e.variants) {
        const mw = t.w / MODULE;
        const mh = t.h / MODULE;
        for (let my = 0; my <= G - mh; my++)
          for (let mx = 0; mx <= G - mw; mx++) {
            if (!fits(mx, my, mw, mh, e.set)) continue;
            const sc = Math.hypot(mx + mw / 2 - sx, my + mh / 2 - sy) + rnd() * 3;
            if (!best || sc > best.score) best = { e, t, mx, my, score: sc };
          }
      }
    if (!best) throw new Error("cave: nowhere in the Deep fits the chimney");
    place(best.e, best.t, best.mx, best.my);
  }

  // ---- THE LINES: the track and the river, each an unbroken run of rooms
  // across its band. A line room must carry its own type on exactly the two
  // sides it joins (in and out) — the line's ends run into the map's edge.
  const alongOf = (mx: number, my: number): number => (edge === 0 || edge === 2 ? mx : my);
  const moduleAt = (d: number, a: number): [number, number] => (edge === 0 ? [a, d] : edge === 2 ? [a, G - 1 - d] : edge === 3 ? [d, a] : [G - 1 - d, a]);
  void alongOf;
  const sideTo = (ax: number, ay: number, bx: number, by: number): Side => (bx > ax ? 1 : bx < ax ? 3 : by > ay ? 2 : 0);
  const typedSides = (t: Tile, types: readonly string[]): Set<Side> => {
    const out = new Set<Side>();
    for (const sd of [0, 1, 2, 3] as Side[]) {
      const lanes: [number, number][] = sd === 0 || sd === 2 ? [[SLOT_AT, sd === 0 ? 0 : t.h - 1], [SLOT_AT + 1, sd === 0 ? 0 : t.h - 1]] : [[sd === 3 ? 0 : t.w - 1, SLOT_AT], [sd === 3 ? 0 : t.w - 1, SLOT_AT + 1]];
      if (lanes.every(([x, y]) => t.cell[y * t.w + x] === 1 && types.includes(t.dia.types[t.zone[y * t.w + x]]))) out.add(sd);
    }
    return out;
  };
  const seams: { a: number; b: number; side: Side }[] = [];
  const unmetLines: string[] = [];
  const layLine = (label: string, types: readonly string[], lo: number, hi: number, kindAt?: (along: number) => string): void => {
    const fam0 = lib.filter((e) => e.def.role === "block" && types.includes(e.def.type) && e.mw === 1 && e.mh === 1);
    if (!fam0.length || hi < lo) return;
    const lr = rngFor(seed, salt(`cc1:${label}`));
    // the path, in (depth, along) steps: across the band, bending now and then
    const path: [number, number][] = [];
    let d = lo + Math.floor(lr() * (hi - lo + 1));
    let a = 0;
    path.push([d, a]);
    let lastBent = false;
    while (a < G - 1) {
      if (!lastBent && lr() < 0.3) {
        const nd = d + (lr() < 0.5 ? -1 : 1);
        if (nd >= lo && nd <= hi) {
          d = nd;
          path.push([d, a]);
          lastBent = true;
          continue;
        }
      }
      a++;
      path.push([d, a]);
      lastBent = false;
    }
    const placed: CaveInst[] = [];
    for (let k = 0; k < path.length; k++) {
      const [mx, my] = moduleAt(path[k][0], path[k][1]);
      const want = new Set<Side>();
      // in: the previous module (or the map's edge before the first)
      const prev = k ? moduleAt(path[k - 1][0], path[k - 1][1]) : moduleAt(path[k][0], path[k][1] - 1);
      const next = k < path.length - 1 ? moduleAt(path[k + 1][0], path[k + 1][1]) : moduleAt(path[k][0], path[k][1] + 1);
      want.add(sideTo(mx, my, prev[0], prev[1]));
      want.add(sideTo(mx, my, next[0], next[1]));
      const opts: { e: CaveLibEntry; t: Tile }[] = [];
      const want1 = kindAt?.(path[k][1]);
      const fam = (want1 ? fam0.filter((e) => e.def.kind === want1) : fam0).filter((e) => e.def.max === undefined || (count.get(e.def.id) ?? 0) < e.def.max);
      for (const e of fam) {
        if (!fits(mx, my, 1, 1, e.set)) continue;
        for (const t of e.variants) {
          const got = typedSides(t, types);
          if (got.size === want.size && [...want].every((x) => got.has(x))) for (let w = 0; w < Math.max(1, Math.round((e.def.weight ?? 1) * 4)); w++) opts.push({ e, t });
        }
      }
      if (!opts.length) {
        unmetLines.push(`${label}@${mx},${my}`);
        placed.push(null as unknown as CaveInst);
        continue;
      }
      const o = opts[Math.floor(lr() * opts.length)];
      placed.push(place(o.e, o.t, mx, my));
    }
    for (let k = 1; k < placed.length; k++) {
      const A = placed[k - 1];
      const B = placed[k];
      if (!A || !B) continue;
      seams.push({ a: A.id, b: B.id, side: sideTo(A.mx, A.my, B.mx, B.my) });
    }
  };
  // THE TRACK: one straight line along the Station's third row. The station
  // proper stands where the stair is — its platforms (and the dead train at
  // the middle ones) — and the rest is tunnel out to the map's edges.
  {
    layLine("track", ["trackbed"], LINE_ROW, LINE_ROW, (a) => {
      const off = Math.abs(a - stairAlong);
      return off <= TRAIN_HALF ? "station-train" : off <= STATION_HALF ? "station" : "tunnel";
    });
  }
  layLine("river", ["caveriver"], STATION_ROWS + 1, G - DEEP_ROWS - 2);
  const LINE_TYPES = new Set(["trackbed", "caveriver"]);

  // ---- THE MINIMUMS: every room the library asks for at least N of, first,
  // wherever it fits (shuffled)
  const spots: number[] = [];
  for (let i = 0; i < G * G; i++) spots.push(i);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const e of lib.filter((x) => (x.def.min ?? 0) > 0 && x.def.role === "block" && !LINE_TYPES.has(x.def.type))) {
    for (const m of spots) {
      if ((count.get(e.def.id) ?? 0) >= (e.def.min ?? 0)) break;
      const mx = m % G;
      const my = (m / G) | 0;
      const ok = e.variants.filter((t) => fits(mx, my, t.w / MODULE, t.h / MODULE, e.set, e));
      if (ok.length) place(e, pickOf(rnd, ok), mx, my);
    }
  }

  // ---- THE PACK: the rest, biggest first where it fits
  const blocks = lib.filter((e) => e.def.role === "block" && !LINE_TYPES.has(e.def.type));
  for (const pass of [0, 1])
    for (const m of spots) {
      if (occ[m] >= 0) continue;
      const mx0 = m % G;
      const my0 = (m / G) | 0;
      let best: { e: CaveLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
      for (const e of blocks) {
        if (e.def.max !== undefined && (count.get(e.def.id) ?? 0) >= e.def.max) continue;
        if (pass === 0 && e.mw * e.mh < 4) continue;
        for (const [mw, mh] of e.mw === e.mh ? [[e.mw, e.mh]] : [[e.mw, e.mh], [e.mh, e.mw]]) {
          for (let dy = 0; dy < mh; dy++)
            for (let dx = 0; dx < mw; dx++) {
              const mx = mx0 - dx;
              const my = my0 - dy;
              if (!fits(mx, my, mw, mh, e.set, e)) continue;
              if (pass === 0 && rnd() > 0.3) continue;
              const area = mw * mh;
              const seen = count.get(e.def.id) ?? 0;
              const score = Math.sqrt(area) * 1.2 + (e.def.weight ?? 1) * (0.4 + rnd()) * 3 - seen * 0.3;
              if (!best || score > best.score) {
                const vs = e.variants.filter((t) => t.w === mw * MODULE && t.h === mh * MODULE);
                if (vs.length) best = { e, t: pickOf(rnd, vs), mx, my, score };
              }
            }
        }
      }
      if (best) place(best.e, best.t, best.mx, best.my);
    }
  const unmet = [...lib.filter((e) => (e.def.min ?? 0) > (count.get(e.def.id) ?? 0)).map((e) => e.def.id), ...unmetLines];

  // ---- THE DOORWAYS: a spanning tree over the rooms, then a share of the rest
  type Cand = { a: number; b: number; x: number; y: number; side: Side; cutA: number; cutB: number };
  const slotAt = new Set<string>();
  insts.forEach((inst, id) => tiles[id].sockets.forEach((so) => slotAt.add(`${id},${inst.x + so.x},${inst.y + so.y},${so.side}`)));
  const cutDepth = (id: number, gx: number, gy: number, side: Side): number => {
    if (slotAt.has(`${id},${gx},${gy},${side}`)) return 0;
    // the stair's room and the chimney's room keep the doorways they drew
    if (insts[id].role !== "block") return -1;
    const t = tiles[id];
    const inst = insts[id];
    const lx = gx - inst.x;
    const ly = gy - inst.y;
    let need = 0;
    for (let q = 0; q < 2; q++) {
      let k = 0;
      for (; k <= MODULE / 2; k++) {
        const x = lx + (side === 0 || side === 2 ? q : 0) - DX[side] * k;
        const y = ly + (side === 1 || side === 3 ? q : 0) - DY[side] * k;
        if (x < 0 || y < 0 || x >= t.w || y >= t.h) return -1;
        if (t.pieces.some((p) => p.k !== "lamp" && p.k !== "batten" && p.k !== "flicker" && p.x === x && p.y === y)) return -1;
        const c = t.cell[y * t.w + x];
        if (c === 1) {
          // a cut lands on floor within a step of the doorway's
          if (Math.abs(t.hgt[y * t.w + x]) > 1) return -1;
          break;
        }
        if (c !== 2) return -1;
      }
      if (k > MODULE / 2) return -1;
      need = Math.max(need, k);
    }
    return need;
  };
  const cands: Cand[] = [];
  insts.forEach((inst, id) => {
    for (const side of [1, 2] as Side[]) {
      const along = side === 1 ? inst.mh : inst.mw;
      for (let m = 0; m < along; m++) {
        const gx = side === 1 ? inst.x + inst.w - 1 : inst.x + m * MODULE + SLOT_AT;
        const gy = side === 1 ? inst.y + m * MODULE + SLOT_AT : inst.y + inst.h - 1;
        const nx = gx + DX[side];
        const ny = gy + DY[side];
        const mx = Math.floor((nx - O) / MODULE);
        const my = Math.floor((ny - O) / MODULE);
        if (mx < 0 || my < 0 || mx >= G || my >= G) continue;
        const other = occ[my * G + mx];
        if (other < 0 || other === id) continue;
        const cutA = cutDepth(id, gx, gy, side);
        const cutB = cutDepth(other, nx, ny, ((side + 2) % 4) as Side);
        if (cutA < 0 || cutB < 0) continue;
        cands.push({ a: id, b: other, x: gx, y: gy, side, cutA, cutB });
      }
    }
  });
  const dRnd = rngFor(seed, salt("cc1:doors"));
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(dRnd() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  cands.sort((p, q) => Number(p.cutA + p.cutB > 0) - Number(q.cutA + q.cutB > 0));
  const parent = insts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const open = new Set<Cand>();
  for (const sm of seams) {
    const ra = find(sm.a);
    const rb = find(sm.b);
    if (ra !== rb) parent[ra] = rb;
  }
  let tree = 0;
  for (const c of cands) {
    const ra = find(c.a);
    const rb = find(c.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    open.add(c);
    tree++;
  }
  for (const c of cands) {
    if (open.has(c) || c.cutA + c.cutB !== 0) continue;
    const deep = insts[c.a].zone === ZONE_DEEP || insts[c.b].zone === ZONE_DEEP;
    if (dRnd() >= (deep ? EXTRA_OPEN_DEEP : EXTRA_OPEN)) continue;
    open.add(c);
  }
  const cuts: { x: number; y: number; side: Side; depth: number }[] = [];
  for (const c of open) {
    if (c.cutA) cuts.push({ x: c.x, y: c.y, side: c.side, depth: c.cutA });
    if (c.cutB) cuts.push({ x: c.x + DX[c.side], y: c.y + DY[c.side], side: ((c.side + 2) % 4) as Side, depth: c.cutB });
  }

  const built = materialize(seed, size, insts, tiles, open, cuts, seams);
  // ---- THE CLIMBING ROPE: deep in the Caverns, drawn from the best share of
  // the spots by their walk from the way in
  let rope: CavePlan["rope"] = null;
  const s = built.sector;
  const lawful = built.ropeSpots.filter((p) => placeable(s, p.x, p.y));
  if (lawful.length && built.chimney) {
    const fromIn = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    const fromTop = distanceMap(s, [{ x: built.chimney.x, y: built.chimney.y }]);
    const scored = lawful
      .map((p) => ({ p, d: fromIn[p.y * size + p.x], h: fromTop[p.y * size + p.x] }))
      .filter((q) => q.d >= 0 && q.h >= 0)
      .sort((a, b) => b.d - a.d);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * ROPE_TOP_SHARE)));
    if (top.length) rope = { ...top[Math.floor(rngFor(seed, "cc1:rope")() * top.length)].p };
  }
  // what the service needs from the plan rides on the sector (server only)
  s.cave = { rope, ropeSpots: built.ropeSpots.map((p) => ({ ...p })), chimney: built.chimney ? { ...built.chimney } : null };
  return { ...built, rope, insts, tiles, zoneOfModule, opened: open.size, tree, cuts: cuts.length, unmet };
}

function materialize(
  seed: number,
  size: number,
  insts: CaveInst[],
  tiles: Tile[],
  open: Set<{ a: number; b: number; x: number; y: number; side: Side }>,
  cuts: { x: number; y: number; side: Side; depth: number }[] = [],
  seams: { a: number; b: number; side: Side }[] = [],
): Pick<CavePlan, "sector" | "chimney" | "ropeSpots" | "lostCells"> {
  const n = size * size;
  const styleTable = new StyleTable();
  const stairTable = new StairTable();
  const s: Sector = {
    seed,
    size,
    wallN: new Uint8Array(n),
    wallW: new Uint8Array(n),
    solid: new Uint8Array(n).fill(1),
    floor: new Int8Array(n),
    background: new Uint8Array(n),
    district: new Uint8Array(n),
    landmark: new Uint8Array(n),
    districts: CAVE_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
    landmarks: [],
    doors: [],
    kit: [],
    look: new Uint16Array(n),
    styles: styleTable.styles,
    stairSpecs: stairTable.specs,
    deco: new Uint8Array(n),
    section: new Uint8Array(n),
  };
  const space = new Int32Array(n);
  let nextSpace = 1;
  const doors: Door[] = [];
  let chimney: WallSite | null = null;
  const ropeSpots: { x: number; y: number }[] = [];
  for (const inst of insts) {
    const t = tiles[inst.id];
    const base = nextSpace;
    nextSpace += t.roomKinds.length;
    const lookCode = styleTable.styleOf(t.def.look);
    const stairCode = stairTable.styleOf(t.def.stairs);
    const ownZone = t.dia.types.indexOf(t.def.type);
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const i = y * t.w + x;
        if (!t.cell[i]) continue;
        const gi = (inst.y + y) * size + inst.x + x;
        space[gi] = base + t.room[i];
        s.solid[gi] = t.cell[i] === 2 ? 1 : 0;
        if (t.scenery[i]) s.background[gi] = 1;
        s.floor[gi] = t.hgt[i];
        if (t.lid[i] !== LID_NONE) (s.lid ??= new Int8Array(n).fill(LID_NONE))[gi] = t.lid[i];
        if (t.stair[i] >= 0) {
          (s.stair ??= new Int8Array(n).fill(STAIR_NONE))[gi] = t.stair[i];
          if (stairCode) (s.stairStyle ??= new Uint8Array(n))[gi] = stairCode;
        }
        s.district[gi] = t.zone[i];
        s.section![gi] = inst.zone;
        if (lookCode && t.zone[i] === ownZone) s.look![gi] = lookCode;
        if (t.wallN[i]) s.wallN[gi] = 1;
        if (t.wallW[i]) s.wallW[gi] = 1;
        if (t.deco[i]) s.deco![gi] = t.deco[i];
      }
    }
    t.props.forEach((pl, k) => {
      if (pl.c < 100 && copyRoll(seed, inst.id, k) * 100 >= pl.c) return;
      const { c: _c, text, ...rest } = pl;
      s.kit!.push({ ...rest, x: inst.x + pl.x, y: inst.y + pl.y, ...(text ? { text } : {}) });
    });
    t.marks.forEach((m, k) => {
      if ((m.chance ?? 100) < 100 && copyRoll(seed, inst.id, k, 1) * 100 >= m.chance!) return;
      (s.marks ??= []).push({ ...m, x: inst.x + m.x, y: inst.y + m.y });
    });
    for (const p of t.pieces) {
      const site = { x: inst.x + p.x, y: inst.y + p.y, side: p.o as Side };
      if (p.k === "entrance") doors.push({ x: site.x, y: site.y, edge: "NESW"[p.o] as Door["edge"], name: CAVE_DOOR_NAME });
      else if (p.k === "chimney") chimney = site;
      else if (p.k === "rope") ropeSpots.push({ x: site.x, y: site.y });
    }
  }
  // THE CUTS: the solid between a rim and its room's floor, knocked through
  for (const c of cuts) {
    for (let q = 0; q < 2; q++)
      for (let k = 0; k < c.depth; k++) {
        const gx = c.x + (c.side === 0 || c.side === 2 ? q : 0) - DX[c.side] * k;
        const gy = c.y + (c.side === 1 || c.side === 3 ? q : 0) - DY[c.side] * k;
        s.solid[gy * size + gx] = 0;
        s.floor[gy * size + gx] = 0;
      }
  }
  const opened = new Set<number>();
  const openEdge = (x: number, y: number, side: Side): void => {
    if (side === 0) opened.add((y * size + x) * 2);
    else if (side === 2) opened.add(((y + 1) * size + x) * 2);
    else if (side === 3) opened.add((y * size + x) * 2 + 1);
    else opened.add((y * size + x + 1) * 2 + 1);
  };
  for (const inst of insts) for (const d of tiles[inst.id].inner) openEdge(inst.x + d.x, inst.y + d.y, d.side);
  for (const c of open) for (let q = 0; q < 2; q++) openEdge(c.side === 2 ? c.x + q : c.x, c.side === 1 ? c.y + q : c.y, c.side);
  // THE SEAMS: where two rooms of a line meet, no wall at all between open
  // cells — the track and the river run on unbroken
  for (const sm of seams) {
    const A = insts[sm.a];
    for (let k = 0; k < MODULE; k++) {
      const x = sm.side === 0 || sm.side === 2 ? A.x + k : sm.side === 1 ? A.x + A.w - 1 : A.x;
      const y = sm.side === 1 || sm.side === 3 ? A.y + k : sm.side === 2 ? A.y + A.h - 1 : A.y;
      const nx = x + DX[sm.side];
      const ny = y + DY[sm.side];
      if (s.solid[y * size + x] || s.solid[ny * size + nx]) continue;
      openEdge(x, y, sm.side);
    }
  }
  for (let y = 1; y < size; y++) {
    for (let x = 1; x < size; x++) {
      const i = y * size + x;
      const a = space[i];
      if (!a) continue;
      const nn = space[i - size];
      if (nn && nn !== a && !opened.has(i * 2)) s.wallN[i] = 1;
      const ww = space[i - 1];
      if (ww && ww !== a && !opened.has(i * 2 + 1)) s.wallW[i] = 1;
    }
  }
  for (let x = 0; x < size; x++) s.wallN[x] = 1;
  for (let y = 0; y < size; y++) s.wallW[y * size] = 1;
  if (doors.length !== 1) throw new Error(`cave: the level carries ${doors.length} entrances (one door per level)`);
  s.doors = doors;
  // landmarks: every NAMED room
  const named = new Map<string, CaveInst[]>();
  for (const inst of insts) if (inst.name) named.set(inst.name, [...(named.get(inst.name) ?? []), inst]);
  for (const [name, list] of named) {
    list.forEach((inst, k) => {
      const id = s.landmarks.length + 1;
      s.landmarks.push({ id, name: list.length === 1 ? name : `${name} No. ${k + 1}`, x: inst.x, y: inst.y, w: inst.w, h: inst.h });
      for (let y = inst.y; y < inst.y + inst.h; y++) for (let x = inst.x; x < inst.x + inst.w; x++) s.landmark[y * size + x] = id;
    });
  }
  // THE REACH CHECK: nothing the way in can't reach survives
  const d0 = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  let lostCells = 0;
  for (let i = 0; i < n; i++) {
    if (s.solid[i] || s.background[i] || d0[i] >= 0 || isPitCell(s, i % size, (i / size) | 0)) continue;
    lostCells++;
    s.solid[i] = 1;
  }
  // wall props onto the face each copy actually backs on to (Nov 2026 polish round)
  seatWallProps(s);
  return { sector: s, chimney, ropeSpots, lostCells };
}

export function generateCaveSector(seed: number, size: number): Sector {
  return planCaveSector(seed, size).sector;
}

/** The room type of a cell (null for rock or out of the map). */
export function caveTypeAt(s: Sector, x: number, y: number): CaveType | null {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return null;
  const i = y * s.size + x;
  if (s.solid[i]) return null;
  return (s.districts[s.district[i]]?.type as CaveType | undefined) ?? null;
}

/** Is this cell in the water (the flooded track bed, the river — every step a
 *  splash)? */
export function caveWet(s: Sector, x: number, y: number): boolean {
  const t = caveTypeAt(s, x, y);
  return !!t && CAVE_WET_TYPES.includes(t);
}

/** Is this cell the Burrower's (a narrow passage or a crawlspace)? */
export function caveBurrow(s: Sector, x: number, y: number): boolean {
  const t = caveTypeAt(s, x, y);
  return !!t && BURROW_TYPES.includes(t);
}

/** Must you crouch here (a crawlspace)? */
export function caveCrawl(s: Sector, x: number, y: number): boolean {
  const t = caveTypeAt(s, x, y);
  return !!t && CRAWL_TYPES.includes(t);
}

export interface CaveReport extends SectorReport {
  chimney: boolean;
  ropeSpots: number;
  /** A set piece on a cell the placement law refuses — MUST be 0. */
  unlawful: number;
  lamps: number;
  wetCells: number;
  burrowCells: number;
  crawlCells: number;
  /** A rope spot in the water or outside the Caverns — MUST be 0. */
  badRope: number;
}

/** The Cave System's own report: the shared one, plus its pieces, its water
 *  and the Burrower's ground. */
export function validateCaveSector(s: Sector): CaveReport {
  const base = validateSector(s);
  const size = s.size;
  const deco = s.deco ?? new Uint8Array(size * size);
  let chimney = false;
  let ropeSpots = 0;
  let unlawful = 0;
  let lamps = 0;
  let wetCells = 0;
  let burrowCells = 0;
  let crawlCells = 0;
  let badRope = 0;
  for (let i = 0; i < size * size; i++) {
    const k = cdecoKind(deco[i]);
    const x = i % size;
    const y = (i / size) | 0;
    if (k === CDECO.chimney) chimney = true;
    if (k === CDECO.rope) ropeSpots++;
    if (k === CDECO.lamp) lamps++;
    if ((k === CDECO.chimney || k === CDECO.rope) && !placeable(s, x, y)) unlawful++;
    if (caveWet(s, x, y)) wetCells++;
    if (caveBurrow(s, x, y)) burrowCells++;
    if (caveCrawl(s, x, y)) crawlCells++;
    if (k === CDECO.rope && (caveWet(s, x, y) || s.section?.[i] !== ZONE_CAVERNS)) badRope++;
  }
  return { ...base, chimney, ropeSpots, unlawful, lamps, wetCells, burrowCells, crawlCells, badRope };
}

export { sectorFingerprint, distanceMap, ZONE_STATION, ZONE_CAVERNS, ZONE_DEEP };
