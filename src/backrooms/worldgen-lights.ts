// LEVEL 6 — LIGHTS OUT, BUILT FROM HAND-MADE ROOMS (sector L1).
//
// Josh, 2026-10-14: the Handwheel and the sea hatch, a creature that hunts by
// sound, the map as proposed. The design is BACKROOMS.md → "LEVEL 6 — LIGHTS
// OUT".
//
// It is the hotel's LATTICE (worldgen-hotel.ts), simpler:
//
//   1. THE LIBRARY. Every room is drawn in lights-rooms.json (the dialect:
//      lights-tiles.ts), a whole number of 8-cell modules, filled edge to
//      edge, a doorway slot in the middle of every module side. Each room is
//      in the dark corridors ("dark") or the Wet End ("wet").
//   2. THE WAY IN — the stair down from the hotel — at the middle of one edge
//      of the map. THE WET END is the WET_ROWS module rows along the OPPOSITE
//      edge; the corridors are the rest.
//   3. THE SEA HATCH as far into the Wet End from the way in as fits.
//   4. THE MINIMUMS, then THE PACK, biggest first, exactly as the hotel.
//   5. THE DOORWAYS: a spanning tree, then a share of the rest.
//   6. THE DEAD LAMPS: every fixture drawn dark (the fixture law still holds:
//      a real lamp model, casting nothing).
//   7. THE HANDWHEEL: of every wheel spot the rooms drew, one is chosen — far
//      from the way in AND far from the hatch, so finding it and finding the
//      hatch are two different searches.
//
// Walls are DERIVED (a wall between two rooms unless a joined slot opens it),
// and the reach check at the end must find nothing to seal.

import { type Sector, type District, type DistrictType, type Door, rngFor, distanceMap, validateSector, sectorFingerprint, isPitCell, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { LIGHTS_TYPES, MODULE, SLOT_AT, WET_ROWS, ZONE_DARK, ZONE_WET, WET_TYPES, LIGHTS_DOOR_NAME, LDECO, ldecoKind, WHEEL_SPOTS_MIN, BATTERY_SPOTS_MIN, type LightsType } from "./lights-vocab";
import { type TileDef, type Tile, type Lint, tileVariants, type Side, DX, DY } from "./tiles";
import { lintLightsTile } from "./lights-tiles";
import { placeable } from "./placement";
import LIBRARY_JSON from "./lights-rooms.json";
import { seatWallProps } from "./kitseat";

/** The library as shipped. */
export const LIGHTS_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** SECTOR L1 (Oct 2026): seed and size, and the fingerprint below, are what
 *  the server boots and checks. 114 cells = 14 modules a side and a one-cell rim (the hotel's). */
export const SECTOR_L = Object.freeze({ id: "L1", seed: 20261014, size: 114 });
/** Captured at freeze time; regenerating Lights Out must always produce this. */
export const SECTOR_L_FINGERPRINT = "sha256:6e085b149fbdba0dec2623d713df1b18bef2f336d1bd77f876fc9c2e3571d15a";

/** Of the slots the spanning tree doesn't need, the share that open anyway.
 *  Fewer than the hotel's: down here a dead end is part of the level. */
const EXTRA_OPEN = 0.35;
/** The Handwheel is drawn from the best share of the spots (by distance from
 *  the way in and from the hatch), so it is always far, never the same. */
export const WHEEL_TOP_SHARE = 0.3;

export interface LightsLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  mw: number;
  mh: number;
  set: string;
}

export function loadLightsLibrary(defs: readonly TileDef[] = LIGHTS_LIBRARY, lax = false): LightsLibEntry[] {
  const out: LightsLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintLightsTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`lights: room "${def.id}" is broken — ${l.errors[0]}`);
    const set = String(Array.isArray(def.set) ? def.set[0] : def.set);
    out.push({ def, base: l.tile, variants: l.errors.length ? [] : tileVariants(l.tile), lint: { errors: l.errors, warnings: l.warnings }, mw: l.tile.w / MODULE, mh: l.tile.h / MODULE, set });
  }
  return out;
}

export interface LightsInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  type: string;
  /** ZONE_DARK or ZONE_WET. */
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

export interface LightsPlan {
  sector: Sector;
  insts: LightsInst[];
  tiles: Tile[];
  /** The zone of every module (row-major): ZONE_DARK or ZONE_WET. */
  zoneOfModule: number[];
  /** The sea hatch. */
  hatch: WallSite | null;
  /** Every spot the Handwheel may lie on, and the one it does. */
  wheelSpots: { x: number; y: number }[];
  wheel: { x: number; y: number } | null;
  /** Every spot a spare battery may lie on. */
  batterySpots: { x: number; y: number }[];
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

export function planLightsSector(seed: number, size: number, library: readonly TileDef[] = LIGHTS_LIBRARY): LightsPlan {
  let last: LightsPlan | null = null;
  for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt++) {
    last = planOnce(seed, size, library, attempt);
    if (last.lostCells === 0 && !last.unmet.length && last.wheel && last.wheelSpots.length >= WHEEL_SPOTS_MIN && last.batterySpots.length >= BATTERY_SPOTS_MIN) return last;
  }
  return last!;
}

function planOnce(seed: number, size: number, library: readonly TileDef[], attempt: number): LightsPlan {
  const salt = (label: string): string => (attempt ? `${label}:${attempt}` : label);
  const lib = loadLightsLibrary(library);
  const byRole = (r: string): LightsLibEntry[] => lib.filter((e) => e.def.role === r);
  const start = byRole("start");
  const goal = byRole("goal");
  if (!start.length) throw new Error("lights: the library needs a start room (the one with the stair)");
  if (!goal.length) throw new Error("lights: the library needs a goal room (the one with the sea hatch)");
  const G = Math.floor((size - 2) / MODULE);
  const O = Math.floor((size - G * MODULE) / 2);
  const occ = new Int32Array(G * G).fill(-1);
  const insts: LightsInst[] = [];
  const tiles: Tile[] = [];
  const count = new Map<string, number>();
  const rnd = rngFor(seed, salt("ll1:pack"));

  // ---- THE ZONES: the Wet End is the far WET_ROWS rows from the way in
  const edge = Math.floor(rnd() * 4) as Side;
  const depthOf = (mx: number, my: number): number => (edge === 0 ? my : edge === 2 ? G - 1 - my : edge === 3 ? mx : G - 1 - mx);
  const zoneOfModule: number[] = [];
  for (let my = 0; my < G; my++) for (let mx = 0; mx < G; mx++) zoneOfModule.push(depthOf(mx, my) >= G - WET_ROWS ? ZONE_WET : ZONE_DARK);
  const zoneOfSet = (set: string): number => (set === "wet" ? ZONE_WET : ZONE_DARK);

  /** Free, inside the grid, and wholly inside the room's own zone. */
  const fits = (mx: number, my: number, mw: number, mh: number, set: string): boolean => {
    if (mx < 0 || my < 0 || mx + mw > G || my + mh > G) return false;
    const z = zoneOfSet(set);
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) if (occ[y * G + x] >= 0 || zoneOfModule[y * G + x] !== z) return false;
    return true;
  };
  const place = (e: LightsLibEntry, t: Tile, mx: number, my: number): LightsInst => {
    const id = insts.length;
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) occ[y * G + x] = id;
    const inst: LightsInst = { id, tileId: e.def.id, role: e.def.role, name: e.def.name ?? null, type: e.def.type, zone: zoneOfSet(e.set), mx, my, mw, mh, x: O + mx * MODULE, y: O + my * MODULE, w: t.w, h: t.h };
    insts.push(inst);
    tiles.push(t);
    count.set(e.def.id, (count.get(e.def.id) ?? 0) + 1);
    return inst;
  };
  const centreOf = (i: LightsInst): [number, number] => [i.mx + i.mw / 2, i.my + i.mh / 2];

  // ---- THE WAY IN: the middle of the chosen edge, on the outer wall
  let startInst: LightsInst | null = null;
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
    if (!startInst) throw new Error("lights: nowhere on the map's edge fits the stair");
  }
  // ---- THE SEA HATCH: as far into the Wet End from the way in as fits, and
  // off to one side rather than dead ahead (a level you can cross in a
  // straight line has no search in it)
  {
    const [sx, sy] = centreOf(startInst);
    let best: { e: LightsLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
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
    if (!best) throw new Error("lights: nowhere in the Wet End fits the sea hatch");
    place(best.e, best.t, best.mx, best.my);
  }

  // ---- THE MINIMUMS: every room the library asks for at least N of, first,
  // wherever it fits (shuffled)
  const spots: number[] = [];
  for (let i = 0; i < G * G; i++) spots.push(i);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const e of lib.filter((x) => (x.def.min ?? 0) > 0 && x.def.role === "block")) {
    for (const m of spots) {
      if ((count.get(e.def.id) ?? 0) >= (e.def.min ?? 0)) break;
      const mx = m % G;
      const my = (m / G) | 0;
      const ok = e.variants.filter((t) => fits(mx, my, t.w / MODULE, t.h / MODULE, e.set));
      if (ok.length) place(e, pickOf(rnd, ok), mx, my);
    }
  }

  // ---- THE PACK: the rest, biggest first where it fits
  const blocks = lib.filter((e) => e.def.role === "block");
  for (const pass of [0, 1])
    for (const m of spots) {
      if (occ[m] >= 0) continue;
      const mx0 = m % G;
      const my0 = (m / G) | 0;
      let best: { e: LightsLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
      for (const e of blocks) {
        if (e.def.max !== undefined && (count.get(e.def.id) ?? 0) >= e.def.max) continue;
        if (pass === 0 && e.mw * e.mh < 4) continue;
        for (const [mw, mh] of e.mw === e.mh ? [[e.mw, e.mh]] : [[e.mw, e.mh], [e.mh, e.mw]]) {
          for (let dy = 0; dy < mh; dy++)
            for (let dx = 0; dx < mw; dx++) {
              const mx = mx0 - dx;
              const my = my0 - dy;
              if (!fits(mx, my, mw, mh, e.set)) continue;
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

  // ---- THE DOORWAYS: a spanning tree over the rooms, then a share of the rest
  type Cand = { a: number; b: number; x: number; y: number; side: Side; cutA: number; cutB: number };
  const slotAt = new Set<string>();
  insts.forEach((inst, id) => tiles[id].sockets.forEach((so) => slotAt.add(`${id},${inst.x + so.x},${inst.y + so.y},${so.side}`)));
  const cutDepth = (id: number, gx: number, gy: number, side: Side): number => {
    if (slotAt.has(`${id},${gx},${gy},${side}`)) return 0;
    // the stair's room and the hatch's room keep the doorways they drew
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
        if (t.pieces.some((p) => p.k !== "lamp" && p.k !== "batten" && p.x === x && p.y === y)) return -1;
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
  const dRnd = rngFor(seed, salt("ll1:doors"));
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(dRnd() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
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
  for (const c of cands) {
    if (open.has(c) || c.cutA + c.cutB !== 0 || dRnd() >= EXTRA_OPEN) continue;
    open.add(c);
  }
  const cuts: { x: number; y: number; side: Side; depth: number }[] = [];
  for (const c of open) {
    if (c.cutA) cuts.push({ x: c.x, y: c.y, side: c.side, depth: c.cutA });
    if (c.cutB) cuts.push({ x: c.x + DX[c.side], y: c.y + DY[c.side], side: ((c.side + 2) % 4) as Side, depth: c.cutB });
  }

  const built = materialize(seed, size, insts, tiles, open, cuts);
  // ---- THE HANDWHEEL: far from the way in AND from the hatch, drawn from
  // the best share of the spots
  let wheel: LightsPlan["wheel"] = null;
  const s = built.sector;
  const lawful = built.wheelSpots.filter((p) => placeable(s, p.x, p.y));
  if (lawful.length && built.hatch) {
    const fromIn = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    const fromHatch = distanceMap(s, [{ x: built.hatch.x, y: built.hatch.y }]);
    const scored = lawful
      .map((p) => ({ p, d: fromIn[p.y * size + p.x], h: fromHatch[p.y * size + p.x] }))
      .filter((q) => q.d >= 0 && q.h >= 0)
      .map((q) => ({ p: q.p, score: q.d + 0.6 * q.h }))
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * WHEEL_TOP_SHARE)));
    if (top.length) wheel = { ...top[Math.floor(rngFor(seed, "ll1:wheel")() * top.length)].p };
  }
  // what the service needs from the plan rides on the sector (server only)
  s.lights = { wheel, wheelSpots: built.wheelSpots.map((p) => ({ ...p })), batterySpots: built.batterySpots.map((p) => ({ ...p })), hatch: built.hatch ? { ...built.hatch } : null };
  return { ...built, wheel, insts, tiles, zoneOfModule, opened: open.size, tree, cuts: cuts.length, unmet };
}

function materialize(
  seed: number,
  size: number,
  insts: LightsInst[],
  tiles: Tile[],
  open: Set<{ a: number; b: number; x: number; y: number; side: Side }>,
  cuts: { x: number; y: number; side: Side; depth: number }[] = [],
): Pick<LightsPlan, "sector" | "hatch" | "wheelSpots" | "batterySpots" | "lostCells"> {
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
    districts: LIGHTS_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
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
  let hatch: WallSite | null = null;
  const wheelSpots: { x: number; y: number }[] = [];
  const batterySpots: { x: number; y: number }[] = [];
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
      if (p.k === "entrance") doors.push({ x: site.x, y: site.y, edge: "NESW"[p.o] as Door["edge"], name: LIGHTS_DOOR_NAME });
      else if (p.k === "seahatch") hatch = site;
      else if (p.k === "wheel") wheelSpots.push({ x: site.x, y: site.y });
      else if (p.k === "battery") batterySpots.push({ x: site.x, y: site.y });
    }
  }
  // THE CUTS: the solid between a rim and its room's floor, knocked through
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
  if (doors.length !== 1) throw new Error(`lights: the level carries ${doors.length} entrances (one door per level)`);
  s.doors = doors;
  // landmarks: every NAMED room
  const named = new Map<string, LightsInst[]>();
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
  return { sector: s, hatch, wheelSpots, batterySpots, lostCells };
}

export function generateLightsSector(seed: number, size: number): Sector {
  return planLightsSector(seed, size).sector;
}

/** Is this cell in the Wet End's water (every step a splash)? A cell is wet
 *  when its room type is one of the flooded ones. */
export function lightsWet(s: Sector, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return false;
  const i = y * s.size + x;
  if (s.solid[i]) return false;
  const type = s.districts[s.district[i]]?.type as LightsType | undefined;
  return !!type && WET_TYPES.includes(type);
}

export interface LightsReport extends SectorReport {
  hatch: boolean;
  wheelSpots: number;
  batterySpots: number;
  /** A set piece on a cell the placement law refuses — MUST be 0. */
  unlawful: number;
  lamps: number;
  /** Floor cells in the water. */
  wetCells: number;
  /** A wheel or battery spot standing in the water — MUST be 0. */
  wetSpots: number;
}

/** Lights Out's own report: the shared one, plus its pieces and its water. */
export function validateLightsSector(s: Sector): LightsReport {
  const base = validateSector(s);
  const size = s.size;
  const deco = s.deco ?? new Uint8Array(size * size);
  let hatch = false;
  let wheelSpots = 0;
  let batterySpots = 0;
  let unlawful = 0;
  let lamps = 0;
  let wetCells = 0;
  let wetSpots = 0;
  for (let i = 0; i < size * size; i++) {
    const k = ldecoKind(deco[i]);
    const x = i % size;
    const y = (i / size) | 0;
    if (k === LDECO.seahatch) hatch = true;
    if (k === LDECO.wheel) wheelSpots++;
    if (k === LDECO.battery) batterySpots++;
    if (k === LDECO.lamp) lamps++;
    if ((k === LDECO.seahatch || k === LDECO.wheel || k === LDECO.battery) && !placeable(s, x, y)) unlawful++;
    const wet = lightsWet(s, x, y);
    if (wet) wetCells++;
    if (wet && (k === LDECO.wheel || k === LDECO.battery)) wetSpots++;
  }
  return { ...base, hatch, wheelSpots, batterySpots, unlawful, lamps, wetCells, wetSpots };
}

export { sectorFingerprint, distanceMap, ZONE_DARK, ZONE_WET };
