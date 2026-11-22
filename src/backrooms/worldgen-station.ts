// LEVEL 3 — THE ELECTRICAL STATION, BUILT FROM HAND-MADE ROOMS (sector S1).
//
// Josh, Oct 2026: a smaller, denser level than Pipe Dreams — tight service
// corridors and machine rooms — with SIX BREAKERS that only ever switch on,
// a CUTOFF per section that kills that section's power for a while, ARCING
// PANELS, ROLLING BLACKOUTS and ELECTRIFIED WATER that is safe while its
// section is cut. The design is BACKROOMS.md → "LEVEL 3 — ELECTRICAL STATION".
//
// It is Level 0's LATTICE (worldgen-lobby.ts), with the station's own steps:
//
//   1. THE LIBRARY. Every room is drawn in station-rooms.json (the dialect:
//      station-tiles.ts), a whole number of 8-cell modules, filled edge to
//      edge, a doorway slot in the middle of every module side.
//   2. THE SECTIONS. The module grid is dealt into SIX power circuits — a
//      Voronoi over six seeds spread as far apart as the grid allows. Every
//      room sits wholly inside one section.
//   3. THE PRESSURE DOOR — the one way in, from Pipe Dreams — at the middle
//      of one edge of the map; THE LIFT HALL (the shutter to Level 4) as far
//      from it as the map allows.
//   4. THE BREAKERS: one breaker room per section, the one deepest in it.
//   5. THE PACK and THE DOORWAYS, exactly as Level 0: the rest filled biggest
//      first, a spanning tree over the rooms, then a share of the other slots.
//   6. THE CUTOFFS: one per section, on a wall of that section's room nearest
//      the way in — a player meets a section's cutoff before its depths.
//   7. THE DRY ROUTES (the placement law's station rule): every cutoff can be
//      walked to WITHOUT crossing any water; every breaker without crossing
//      another section's water (its own may stand in the way — cutting the
//      section is the answer). Any water in the way of that is drained.
//
// Walls are DERIVED (a wall between two rooms unless a joined slot opens it),
// and the reach check at the end must find nothing to seal.

import { type Sector, type District, type DistrictType, type Door, rngFor, distanceMap, validateSector, sectorFingerprint, isPitCell, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { STATION_TYPES, MODULE, SLOT_AT, SECTIONS, STATION_DOOR_NAME, SHUTTER_NAME, SDECO, sdecoByte, sdecoKind } from "./station-vocab";
import { type TileDef, type Tile, type Lint, tileVariants, type Side, DX, DY } from "./tiles";
import { lintStationTile } from "./station-tiles";
import { placeable } from "./placement";
import LIBRARY_JSON from "./station-rooms.json";
import { seatWallProps } from "./kitseat";

/** The library as shipped. */
export const STATION_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** SECTOR S1 IS FROZEN (Oct 2026): seed and size, and the fingerprint below,
 *  are what the server boots and checks. 130 cells = 16 modules a side —
 *  about half Pipe Dreams' 256² by area, as Josh asked ("smaller and denser"). */
export const SECTOR_S = Object.freeze({ id: "S1", seed: 20261009, size: 130 });
/** Captured at freeze time; regenerating the station must always produce this. */
export const SECTOR_S_FINGERPRINT = "sha256:4ab66b2ace36d87dffab609fef6625a2d46253265d2aa12a5bfb5e61aa4302c1";

/** Of the slots the spanning tree doesn't need, the share that open anyway.
 *  Lower than Level 0's half: the station is tighter, more corridor-like. */
const EXTRA_OPEN = 0.32;
/** Lamp states, rolled per lamp from the seed: working · flickering · dead. */
const LAMP_FLICKER = 0.1;
const LAMP_DEAD = 0.07;

export interface StationLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  mw: number;
  mh: number;
}

export function loadStationLibrary(defs: readonly TileDef[] = STATION_LIBRARY, lax = false): StationLibEntry[] {
  const out: StationLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintStationTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`station: room "${def.id}" is broken — ${l.errors[0]}`);
    out.push({ def, base: l.tile, variants: l.errors.length ? [] : tileVariants(l.tile), lint: { errors: l.errors, warnings: l.warnings }, mw: l.tile.w / MODULE, mh: l.tile.h / MODULE });
  }
  return out;
}

export interface StationInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  type: string;
  /** The power circuit the room is on, 1..SECTIONS. */
  section: number;
  mx: number;
  my: number;
  mw: number;
  mh: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A wall-backed set piece on the map: the cell you stand on to use it, and
 *  the wall it hangs on. */
export interface WallSite {
  x: number;
  y: number;
  side: Side;
}

export interface StationPlan {
  sector: Sector;
  insts: StationInst[];
  tiles: Tile[];
  /** Section 1..SECTIONS per module (row-major), the region map. */
  sectionOfModule: number[];
  /** breakers[k] is section k+1's breaker. */
  breakers: (WallSite & { section: number })[];
  /** cutoffs[k] is section k+1's cutoff. */
  cutoffs: (WallSite & { section: number })[];
  shutter: WallSite | null;
  opened: number;
  tree: number;
  /** Doorways knocked through a room's solid flank (no slot there). */
  cuts: number;
  /** Open cells the reach check sealed — MUST be 0. */
  lostCells: number;
  /** Water cells drained to keep a cutoff or a breaker on a dry route. */
  drained: number;
  /** Rooms the library asks for (min) that didn't fit. */
  unmet: string[];
  /** Sections no breaker room could be placed in — MUST be empty. */
  breakerless: number[];
}

const pickOf = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];

export function planStationSector(seed: number, size: number, library: readonly TileDef[] = STATION_LIBRARY): StationPlan {
  const lib = loadStationLibrary(library);
  const start = lib.filter((e) => e.def.role === "start");
  const goal = lib.filter((e) => e.def.role === "goal");
  const breakerRooms = lib.filter((e) => e.def.role === "breaker");
  if (!start.length) throw new Error("station: the library needs a start room (the one with the pressure door)");
  if (!goal.length) throw new Error("station: the library needs a goal room (the one with the lift shutter)");
  if (!breakerRooms.length) throw new Error("station: the library needs breaker rooms");
  const G = Math.floor((size - 2) / MODULE);
  const O = Math.floor((size - G * MODULE) / 2);
  const occ = new Int32Array(G * G).fill(-1);
  const insts: StationInst[] = [];
  const tiles: Tile[] = [];
  const count = new Map<string, number>();
  const rnd = rngFor(seed, "st1:pack");

  // ---- THE SECTIONS: six seeds spread by farthest-point, then Voronoi
  const seeds: [number, number][] = [[rnd() * G, rnd() * G]];
  while (seeds.length < SECTIONS) {
    let best: [number, number] = [0, 0];
    let bd = -1;
    for (let k = 0; k < 400; k++) {
      const c: [number, number] = [rnd() * G, rnd() * G];
      const d = Math.min(...seeds.map(([sx, sy]) => (sx - c[0]) ** 2 + (sy - c[1]) ** 2));
      if (d > bd) ((bd = d), (best = c));
    }
    seeds.push(best);
  }
  const sectionOfModule: number[] = [];
  for (let my = 0; my < G; my++)
    for (let mx = 0; mx < G; mx++) {
      let best = 0;
      let bd = Infinity;
      seeds.forEach(([sx, sy], k) => {
        const d = (sx - mx - 0.5) ** 2 + (sy - my - 0.5) ** 2;
        if (d < bd) ((bd = d), (best = k));
      });
      sectionOfModule.push(best + 1);
    }

  /** Free, inside the grid, and wholly inside ONE section. */
  const fits = (mx: number, my: number, mw: number, mh: number): boolean => {
    if (mx < 0 || my < 0 || mx + mw > G || my + mh > G) return false;
    const sec = sectionOfModule[my * G + mx];
    for (let y = my; y < my + mh; y++)
      for (let x = mx; x < mx + mw; x++) if (occ[y * G + x] >= 0 || sectionOfModule[y * G + x] !== sec) return false;
    return true;
  };
  const place = (e: StationLibEntry, t: Tile, mx: number, my: number): StationInst => {
    const id = insts.length;
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) occ[y * G + x] = id;
    const inst: StationInst = {
      id,
      tileId: e.def.id,
      role: e.def.role,
      name: e.def.name ?? null,
      type: e.def.type,
      section: sectionOfModule[my * G + mx],
      mx,
      my,
      mw,
      mh,
      x: O + mx * MODULE,
      y: O + my * MODULE,
      w: t.w,
      h: t.h,
    };
    insts.push(inst);
    tiles.push(t);
    count.set(e.def.id, (count.get(e.def.id) ?? 0) + 1);
    return inst;
  };
  const centreOf = (i: StationInst): [number, number] => [i.mx + i.mw / 2, i.my + i.mh / 2];

  // ---- THE PRESSURE DOOR: the middle of one edge, on the outer wall. Its
  // room may not straddle two sections, so the mid point slides along the
  // edge until it fits.
  let startInst: StationInst | null = null;
  {
    const e = pickOf(rnd, start);
    const edge0 = Math.floor(rnd() * 4) as Side;
    for (let k = 0; k < 4 && !startInst; k++) {
      const edge = ((edge0 + k) % 4) as Side;
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
            if (fits(mx, my, mw, mh)) {
              startInst = place(e, t, mx, my);
              break;
            }
          }
        }
        if (startInst) break;
      }
    }
    if (!startInst) throw new Error("station: nowhere on the map's edge fits the start room");
  }
  const [sx0, sy0] = centreOf(startInst);
  const farFromStart = (mx: number, my: number, mw: number, mh: number): number => Math.hypot(mx + mw / 2 - sx0, my + mh / 2 - sy0);

  // ---- THE LIFT HALL: as far from the way in as the map allows
  {
    const e = pickOf(rnd, goal);
    let best: { t: Tile; mx: number; my: number; score: number } | null = null;
    for (const t of e.variants) {
      const mw = t.w / MODULE;
      const mh = t.h / MODULE;
      for (let my = 0; my <= G - mh; my++)
        for (let mx = 0; mx <= G - mw; mx++) {
          if (!fits(mx, my, mw, mh)) continue;
          const score = farFromStart(mx, my, mw, mh) + rnd() * 0.5;
          if (!best || score > best.score) best = { t, mx, my, score };
        }
    }
    if (!best) throw new Error("station: nowhere fits the lift hall");
    place(e, best.t, best.mx, best.my);
  }

  // ---- THE BREAKERS: one breaker room per section, the deepest one in it
  const breakerless: number[] = [];
  for (let sec = 1; sec <= SECTIONS; sec++) {
    let best: { e: StationLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
    for (const e of breakerRooms) {
      for (const t of e.variants) {
        const mw = t.w / MODULE;
        const mh = t.h / MODULE;
        for (let my = 0; my <= G - mh; my++)
          for (let mx = 0; mx <= G - mw; mx++) {
            if (sectionOfModule[my * G + mx] !== sec || !fits(mx, my, mw, mh)) continue;
            const score = farFromStart(mx, my, mw, mh) + (e.def.weight ?? 1) * rnd() * 2;
            if (!best || score > best.score) best = { e, t, mx, my, score };
          }
      }
    }
    if (best) place(best.e, best.t, best.mx, best.my);
    else breakerless.push(sec);
  }

  // ---- THE PACK: the rest, biggest first where it fits
  const blocks = lib.filter((e) => e.def.role === "block");
  const order: number[] = [];
  for (let i = 0; i < G * G; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const pass of [0, 1])
    for (const m of order) {
      if (occ[m] >= 0) continue;
      const mx0 = m % G;
      const my0 = (m / G) | 0;
      let best: { e: StationLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
      for (const e of blocks) {
        if (e.def.max !== undefined && (count.get(e.def.id) ?? 0) >= e.def.max) continue;
        if (pass === 0 && e.mw * e.mh < 4) continue;
        for (const [mw, mh] of e.mw === e.mh ? [[e.mw, e.mh]] : [[e.mw, e.mh], [e.mh, e.mw]]) {
          for (let dy = 0; dy < mh; dy++)
            for (let dx = 0; dx < mw; dx++) {
              const mx = mx0 - dx;
              const my = my0 - dy;
              if (!fits(mx, my, mw, mh)) continue;
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
  const unmet = lib.filter((e) => (e.def.min ?? 0) > (count.get(e.def.id) ?? 0)).map((e) => e.def.id);

  // ---- THE DOORWAYS: a spanning tree over the rooms, then a share of the rest.
  // Every module side two rooms share is a CANDIDATE. Where both rooms carry a
  // slot there it is NATIVE. Where one (or both) doesn't — a corridor's solid
  // flank — it may still be CUT: knocked through the solid from the rim to the
  // nearest floor along the slot's two lanes, the way a crew would break into
  // a service run. Native doorways come first; a cut is only made where the
  // spanning tree needs it to join the level, so no room is ever sealed off.
  type Cand = { a: number; b: number; x: number; y: number; side: Side; cutA: number; cutB: number };
  const slotAt = new Set<string>();
  insts.forEach((inst, id) => tiles[id].sockets.forEach((so) => slotAt.add(`${id},${inst.x + so.x},${inst.y + so.y},${so.side}`)));
  /** Solid cells to cut through, inward from the rim lane0 (gx, gy) on
   *  `side`, to reach the room's floor on both lanes: 0 = a slot is there
   *  already, -1 = it can't be cut (no floor within half a module). */
  const cutDepth = (id: number, gx: number, gy: number, side: Side): number => {
    if (slotAt.has(`${id},${gx},${gy},${side}`)) return 0;
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
        const c = t.cell[y * t.w + x];
        if (c === 1) break;
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
  const dRnd = rngFor(seed, "st1:doors");
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(dRnd() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  // native first, then the cuts (a stable sort: the shuffle holds within each)
  cands.sort((p, q) => Number(p.cutA + p.cutB > 0) - Number(q.cutA + q.cutB > 0));
  const parent = insts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const open = new Set<Cand>();
  let tree = 0;
  for (const c of cands) {
    const ra = find(c.a);
    const rb = find(c.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    open.add(c);
    tree++;
  }
  for (const c of cands) if (!open.has(c) && c.cutA + c.cutB === 0 && dRnd() < EXTRA_OPEN) open.add(c);
  // the cuts: lane0 on the rim, the side, the depth
  const cuts: { x: number; y: number; side: Side; depth: number }[] = [];
  for (const c of open) {
    if (c.cutA) cuts.push({ x: c.x, y: c.y, side: c.side, depth: c.cutA });
    if (c.cutB) cuts.push({ x: c.x + DX[c.side], y: c.y + DY[c.side], side: ((c.side + 2) % 4) as Side, depth: c.cutB });
  }

  const built = materialize(seed, size, insts, tiles, open, cuts);
  return { ...built, insts, tiles, sectionOfModule, opened: open.size, tree, cuts: cuts.length, unmet, breakerless };
}

/** Can a walker cross from cell i to its neighbour on side s (a flat map:
 *  walls, solid and the map's edge are all that stop you)? */
function canStep(s: Sector, x: number, y: number, side: Side): boolean {
  const n = s.size;
  const nx = x + DX[side];
  const ny = y + DY[side];
  if (nx < 0 || ny < 0 || nx >= n || ny >= n) return false;
  const j = ny * n + nx;
  if (s.solid[j] || s.background[j]) return false;
  if (side === 0) return !s.wallN[y * n + x];
  if (side === 2) return !s.wallN[j];
  if (side === 3) return !s.wallW[y * n + x];
  return !s.wallW[j];
}

/** Breadth-first from `from`, refusing cells `blocked` says no to (the goal
 *  cell itself is always allowed). Returns the path to `to`, or null. */
function walkPath(s: Sector, from: number, to: number, blocked: (i: number) => boolean): number[] | null {
  const n = s.size;
  const prev = new Int32Array(n * n).fill(-2);
  prev[from] = -1;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i === to) break;
    const x = i % n;
    const y = (i / n) | 0;
    for (let side = 0 as Side; side < 4; side = (side + 1) as Side) {
      if (!canStep(s, x, y, side)) continue;
      const j = (y + DY[side]) * n + x + DX[side];
      if (prev[j] !== -2 || (j !== to && blocked(j))) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  if (prev[to] === -2) return null;
  const path: number[] = [];
  for (let i = to; i !== -1; i = prev[i]) path.push(i);
  return path.reverse();
}

function materialize(
  seed: number,
  size: number,
  insts: StationInst[],
  tiles: Tile[],
  open: Set<{ a: number; b: number; x: number; y: number; side: Side }>,
  cuts: { x: number; y: number; side: Side; depth: number }[] = [],
): { sector: Sector; breakers: StationPlan["breakers"]; cutoffs: StationPlan["cutoffs"]; shutter: WallSite | null; lostCells: number; drained: number } {
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
    districts: STATION_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
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
  const breakers: StationPlan["breakers"] = [];
  let shutter: WallSite | null = null;
  const lampRnd = rngFor(seed, "st1:lamps");
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
        s.section![gi] = inst.section;
        if (lookCode && t.zone[i] === ownZone) s.look![gi] = lookCode;
        if (t.wallN[i]) s.wallN[gi] = 1;
        if (t.wallW[i]) s.wallW[gi] = 1;
        if (t.deco[i]) {
          let b = t.deco[i];
          // a lamp's state, rolled per lamp from the seed
          if (sdecoKind(b) === SDECO.lamp) {
            const r = lampRnd();
            b = sdecoByte(SDECO.lamp, r < LAMP_DEAD ? 1 : r < LAMP_DEAD + LAMP_FLICKER ? 2 : 0);
          }
          s.deco![gi] = b;
        }
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
      if (p.k === "entrance") doors.push({ x: site.x, y: site.y, edge: "NESW"[p.o] as Door["edge"], name: STATION_DOOR_NAME });
      else if (p.k === "breaker") breakers.push({ ...site, section: inst.section });
      else if (p.k === "shutter") shutter = site;
    }
  }
  // THE CUTS: the solid between a rim and its room's floor, knocked through
  // along the slot's two lanes; it becomes that room's floor (its cells keep
  // the zone they were drawn with)
  for (const c of cuts) {
    for (let q = 0; q < 2; q++)
      for (let k = 0; k < c.depth; k++) {
        const gx = c.x + (c.side === 0 || c.side === 2 ? q : 0) - DX[c.side] * k;
        const gy = c.y + (c.side === 1 || c.side === 3 ? q : 0) - DY[c.side] * k;
        s.solid[gy * size + gx] = 0;
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
  if (doors.length !== 1) throw new Error(`station: the level carries ${doors.length} entrances (one door per level)`);
  s.doors = doors;
  // landmarks: every NAMED room (the set pieces and the named halls)
  const named = new Map<string, StationInst[]>();
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

  // ---- THE CUTOFFS: one per section, on a wall of its room nearest the way
  // in. The cell must be one an objective may use (the placement law), not
  // a doorway step, not water, not another piece.
  const cutoffs: StationPlan["cutoffs"] = [];
  const isDoorStep = (x: number, y: number): boolean => {
    for (let side = 0 as Side; side < 4; side = (side + 1) as Side) {
      const nx = x + DX[side];
      const ny = y + DY[side];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const ni = ny * size + nx;
      if (canStep(s, x, y, side) && space[ni] !== space[y * size + x]) return true;
    }
    return false;
  };
  for (let sec = 1; sec <= SECTIONS; sec++) {
    const rooms = insts
      .filter((i) => i.section === sec)
      .map((i) => {
        let near = Infinity;
        for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) if (d0[y * size + x] >= 0) near = Math.min(near, d0[y * size + x]);
        return { i, near };
      })
      .filter((r) => Number.isFinite(r.near))
      .sort((a, b) => a.near - b.near);
    let placed: (WallSite & { section: number }) | null = null;
    for (const { i } of rooms) {
      let best: { site: WallSite; d: number } | null = null;
      for (let y = i.y; y < i.y + i.h; y++)
        for (let x = i.x; x < i.x + i.w; x++) {
          const c = y * size + x;
          if (s.deco![c] || !placeable(s, x, y) || isDoorStep(x, y)) continue;
          for (let side = 0 as Side; side < 4; side = (side + 1) as Side) {
            if (canStep(s, x, y, side)) continue; // needs a wall behind it
            const fx = x - DX[side];
            const fy = y - DY[side];
            if (fx < 0 || fy < 0 || fx >= size || fy >= size || !placeable(s, fx, fy) || sdecoKind(s.deco![fy * size + fx]) === SDECO.puddle) continue;
            const d = d0[c];
            if (!best || d < best.d) best = { site: { x, y, side }, d };
          }
        }
      if (best) {
        placed = { ...best.site, section: sec };
        break;
      }
    }
    if (placed) {
      s.deco![placed.y * size + placed.x] = sdecoByte(SDECO.cutoff, placed.side);
      cutoffs.push(placed);
    }
  }

  // ---- THE DRY ROUTES: drain any water that stands in the way of a cutoff
  // (no water at all) or a breaker (no OTHER section's water)
  const entry = s.doors[0].y * size + s.doors[0].x;
  const wet = (i: number): boolean => sdecoKind(s.deco![i]) === SDECO.puddle;
  let drained = 0;
  const drainFor = (target: number, allowedSection: number | null): void => {
    const blocks = (i: number): boolean => wet(i) && s.section![i] !== allowedSection;
    if (walkPath(s, entry, target, blocks)) return;
    const path = walkPath(s, entry, target, () => false);
    if (!path) return;
    for (const i of path) {
      if (!blocks(i)) continue;
      s.deco![i] = 0;
      drained++;
    }
  };
  for (const c of cutoffs) drainFor(c.y * size + c.x, null);
  for (const b of breakers) drainFor(b.y * size + b.x, b.section);
  if (shutter) drainFor((shutter as WallSite).y * size + (shutter as WallSite).x, -1);

  // wall props onto the face each copy actually backs on to (Nov 2026 polish round)
  seatWallProps(s);
  return { sector: s, breakers: breakers.sort((a, b) => a.section - b.section), cutoffs, shutter, lostCells, drained };
}

export function generateStationSector(seed: number, size: number): Sector {
  return planStationSector(seed, size).sector;
}

export interface StationReport extends SectorReport {
  breakers: number;
  cutoffs: number;
  /** Sections without exactly one breaker / one cutoff — MUST be 0. */
  badSections: number;
  /** Cutoffs that can't be walked to without crossing water — MUST be 0. */
  wetCutoffs: number;
  /** Breakers that can't be walked to without crossing another section's
   *  water — MUST be 0. */
  wetBreakers: number;
  /** A breaker, cutoff or the shutter on a cell the placement law refuses —
   *  MUST be 0. */
  unlawful: number;
  shutter: boolean;
  puddleCells: number;
  arcPanels: number;
  lamps: number;
}

/** The station's own report: the shared one, plus the power rules. */
export function validateStationSector(s: Sector): StationReport {
  const base = validateSector(s);
  const size = s.size;
  const deco = s.deco ?? new Uint8Array(size * size);
  const sec = s.section ?? new Uint8Array(size * size);
  const sites: { k: number; x: number; y: number; section: number }[] = [];
  let puddleCells = 0;
  let arcPanels = 0;
  let lamps = 0;
  for (let i = 0; i < size * size; i++) {
    const k = sdecoKind(deco[i]);
    if (k === SDECO.breaker || k === SDECO.cutoff || k === SDECO.shutter) sites.push({ k, x: i % size, y: (i / size) | 0, section: sec[i] });
    if (k === SDECO.puddle) puddleCells++;
    if (k === SDECO.arc) arcPanels++;
    if (k === SDECO.lamp) lamps++;
  }
  const breakers = sites.filter((q) => q.k === SDECO.breaker);
  const cutoffs = sites.filter((q) => q.k === SDECO.cutoff);
  let badSections = 0;
  for (let k = 1; k <= SECTIONS; k++) {
    if (breakers.filter((b) => b.section === k).length !== 1 || cutoffs.filter((c) => c.section === k).length !== 1) badSections++;
  }
  const entry = s.doors[0] ? s.doors[0].y * size + s.doors[0].x : 0;
  const wet = (i: number): boolean => sdecoKind(deco[i]) === SDECO.puddle;
  const wetCutoffs = cutoffs.filter((c) => !walkPath(s, entry, c.y * size + c.x, wet)).length;
  const wetBreakers = breakers.filter((b) => !walkPath(s, entry, b.y * size + b.x, (i) => wet(i) && sec[i] !== b.section)).length;
  const unlawful = sites.filter((q) => !placeable(s, q.x, q.y)).length;
  return {
    ...base,
    breakers: breakers.length,
    cutoffs: cutoffs.length,
    badSections,
    wetCutoffs,
    wetBreakers,
    unlawful,
    shutter: sites.some((q) => q.k === SDECO.shutter),
    puddleCells,
    arcPanels,
    lamps,
  };
}

export { sectorFingerprint, distanceMap, SHUTTER_NAME };
