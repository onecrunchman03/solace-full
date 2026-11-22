// LEVEL 5 — TERROR HOTEL, BUILT FROM HAND-MADE ROOMS (sector H1).
//
// Josh, 2026-10-13: "go with your recommendations" — the guest register, the
// deathmoths, the lifts and the heat. The design is BACKROOMS.md → "LEVEL 5 —
// TERROR HOTEL".
//
// It is the office's LATTICE (worldgen-office.ts), with the hotel's steps:
//
//   1. THE LIBRARY. Every room is drawn in hotel-rooms.json (the dialect:
//      hotel-tiles.ts), a whole number of 8-cell modules, filled edge to edge,
//      a doorway slot in the middle of every module side. Each room is in the
//      Main Hall ("hall") or the Boiler Room ("boiler").
//   2. THE WAY IN — the service stair down from the office — at the middle of
//      one edge of the map. THE BOILER ROOM is the BOILER_ROWS module rows
//      along the OPPOSITE edge; the Main Hall is the rest.
//   3. THE BEVERLY ROOM as near the middle of the Main Hall as fits; THE
//      BOILER ROOM'S DOOR on the line between the zones, as near the middle
//      as fits; THE RUSTY DOOR as far below stairs from it as the map allows.
//   4. THE MINIMUMS (the suites above all — the register needs somewhere to
//      send you), then THE PACK, biggest first, exactly as the office.
//   5. THE DOORWAYS: a spanning tree, then a share of the rest — and NO
//      doorway between the zones except through the Boiler Room's door.
//   6. THE LIGHTS: every chandelier and sconce rolled from the seed — the
//      hall mostly lit (the references are warm and bright), below stairs
//      mostly dead; the way in and the Beverly Room always lit.
//   7. THE ROOM NUMBERS: every suite a number, and THE REGISTER naming one.
//
// Walls are DERIVED (a wall between two rooms unless a joined slot opens it),
// and the reach check at the end must find nothing to seal.

import { type Sector, type District, type DistrictType, type Door, rngFor, distanceMap, validateSector, sectorFingerprint, isPitCell, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { HOTEL_TYPES, MODULE, SLOT_AT, BOILER_ROWS, SUITES_MIN, ZONE_HALL, ZONE_BEVERLY, ZONE_BOILER, HOTEL_DOOR_NAME, HDECO, hdecoByte, hdecoKind, hdecoVar, sconceSide } from "./hotel-vocab";
import { type TileDef, type Tile, type Lint, tileVariants, type Side, DX, DY } from "./tiles";
import { lintHotelTile } from "./hotel-tiles";
import { placeable } from "./placement";
import LIBRARY_JSON from "./hotel-rooms.json";
import { seatWallProps } from "./kitseat";

/** The library as shipped. */
export const HOTEL_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** SECTOR H1 (Oct 2026): seed and size, and the fingerprint below, are what
 *  the server boots and checks. 130 cells = 16 modules a side — the office's
 *  size. */
export const SECTOR_H = Object.freeze({ id: "H1", seed: 20261013, size: 130 });
/** Captured at freeze time; regenerating the hotel must always produce this. */
export const SECTOR_H_FINGERPRINT = "sha256:a736b1789a0e7f8571f177149eb1db139a4ff0ea3094914130e8cf0eae9e899c";

/** Of the slots the spanning tree doesn't need, the share that open anyway —
 *  a hotel's corridors run into each other; a dead end with a swarm behind
 *  you is the level at its worst. */
const EXTRA_OPEN = 0.45;
/** THE LIGHTS, rolled per fixture from the seed. Upstairs the references are
 *  warm and lit (luminance 62, the brightest set yet): a few lamps dead, a
 *  few flickering. Below stairs most of the bulbs are gone. */
export const HALL_DEAD = 0.18;
export const HALL_FLICKER = 0.1;
export const BOILER_DEAD = 0.5;
export const BOILER_FLICKER = 0.15;
/** Numbers on the corridors' SCENERY doors: every number a placard in the
 *  library carries (a sign-plate whose words are a number). A suite is never
 *  given one, so the register's number is on exactly one door. */
export function sceneryNumbers(defs: readonly TileDef[] = HOTEL_LIBRARY): number[] {
  const out = new Set<number>();
  for (const d of defs) for (const pl of d.props ?? []) if (pl.p === "sign-plate" && /^\d+$/.test(String(pl.text ?? "").trim())) out.add(Number(pl.text));
  return [...out].sort((x, y) => x - y);
}

export interface HotelLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  mw: number;
  mh: number;
  set: string;
}

export function loadHotelLibrary(defs: readonly TileDef[] = HOTEL_LIBRARY, lax = false): HotelLibEntry[] {
  const out: HotelLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintHotelTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`hotel: room "${def.id}" is broken — ${l.errors[0]}`);
    const set = String(Array.isArray(def.set) ? def.set[0] : def.set);
    out.push({ def, base: l.tile, variants: l.errors.length ? [] : tileVariants(l.tile), lint: { errors: l.errors, warnings: l.warnings }, mw: l.tile.w / MODULE, mh: l.tile.h / MODULE, set });
  }
  return out;
}

export interface HotelInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  type: string;
  /** ZONE_HALL, ZONE_BEVERLY or ZONE_BOILER. */
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

/** A suite: its Boiler Key spot, its number, and the room it is. */
export interface SuiteSite {
  /** The Boiler Key spot (its hook). */
  x: number;
  y: number;
  number: number;
  inst: number;
  /** Its one doorway (the cell inside the room, on its rim) — where the
   *  number plate hangs. */
  door: { x: number; y: number; side: Side };
  /** The room itself. */
  rect: { x: number; y: number; w: number; h: number };
}

export interface HotelPlan {
  sector: Sector;
  insts: HotelInst[];
  tiles: Tile[];
  /** The zone of every module (row-major): ZONE_HALL or ZONE_BOILER. */
  zoneOfModule: number[];
  /** The guest register, on the Mahjong table. */
  register: { x: number; y: number } | null;
  /** Every suite, numbered. */
  suites: SuiteSite[];
  /** THE SUITE THE REGISTER NAMES: an index into `suites`. */
  target: number;
  /** The rusty door. */
  rustydoor: WallSite | null;
  /** Every lift door. */
  lifts: WallSite[];
  /** Every furnace (the cell it stands on and the wall at its back). */
  furnaces: WallSite[];
  /** Every moth nest. */
  nests: { x: number; y: number }[];
  opened: number;
  tree: number;
  cuts: number;
  /** Open cells the reach check sealed — MUST be 0. */
  lostCells: number;
  /** Rooms the library asks for (min) that didn't fit. */
  unmet: string[];
}

const pickOf = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];

/** How many times the planner re-rolls a map that left a room cut off. A
 *  suite has ONE door, so a run of suites' backs can wall a corridor in; the
 *  re-roll is deterministic (attempt k salts every roll), so the same seed
 *  always builds the same map. */
export const PLAN_ATTEMPTS = 24;

export function planHotelSector(seed: number, size: number, library: readonly TileDef[] = HOTEL_LIBRARY): HotelPlan {
  let last: HotelPlan | null = null;
  for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt++) {
    last = planOnce(seed, size, library, attempt);
    if (last.lostCells === 0 && !last.unmet.length && last.suites.length >= SUITES_MIN) return last;
  }
  return last!;
}

function planOnce(seed: number, size: number, library: readonly TileDef[], attempt: number): HotelPlan {
  const salt = (label: string): string => (attempt ? `${label}:${attempt}` : label);
  const lib = loadHotelLibrary(library);
  const byRole = (r: string): HotelLibEntry[] => lib.filter((e) => e.def.role === r);
  const start = byRole("start");
  const goal = byRole("goal");
  const hubs = byRole("hub");
  const gates = byRole("gate");
  if (!start.length) throw new Error("hotel: the library needs a start room (the one with the service stair)");
  if (!goal.length) throw new Error("hotel: the library needs a goal room (the one with the rusty door)");
  if (!hubs.length) throw new Error("hotel: the library needs a hub room (the Beverly Room, with the register)");
  if (!gates.length) throw new Error("hotel: the library needs a gate room (the Boiler Room's door)");
  if (!byRole("suite").length) throw new Error("hotel: the library needs suites (the register has to name one)");
  const G = Math.floor((size - 2) / MODULE);
  const O = Math.floor((size - G * MODULE) / 2);
  const occ = new Int32Array(G * G).fill(-1);
  const insts: HotelInst[] = [];
  const tiles: Tile[] = [];
  const count = new Map<string, number>();
  const rnd = rngFor(seed, salt("hh1:pack"));

  // ---- THE ZONES: the Boiler Room is the far BOILER_ROWS rows from the way in
  const edge = Math.floor(rnd() * 4) as Side;
  const depthOf = (mx: number, my: number): number => (edge === 0 ? my : edge === 2 ? G - 1 - my : edge === 3 ? mx : G - 1 - mx);
  const zoneOfModule: number[] = [];
  for (let my = 0; my < G; my++) for (let mx = 0; mx < G; mx++) zoneOfModule.push(depthOf(mx, my) >= G - BOILER_ROWS ? ZONE_BOILER : ZONE_HALL);
  const zoneOfSet = (set: string): number => (set === "boiler" ? ZONE_BOILER : ZONE_HALL);

  /** Free, inside the grid, and wholly inside the room's own zone. */
  const fits = (mx: number, my: number, mw: number, mh: number, set: string): boolean => {
    if (mx < 0 || my < 0 || mx + mw > G || my + mh > G) return false;
    const z = zoneOfSet(set);
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) if (occ[y * G + x] >= 0 || zoneOfModule[y * G + x] !== z) return false;
    return true;
  };
  /** A SUITE has one door, so the module in front of it must be somewhere
   *  that door can open onto: in the grid, in the Main Hall, and never
   *  another suite. Those modules are kept from suites from then on. */
  const front = new Set<number>();
  const frontOf = (t: Tile, mx: number, my: number): number => {
    const so = t.sockets[0];
    if (!so) return -1;
    const fx = mx + Math.floor((so.x + DX[so.side]) / MODULE);
    const fy = my + Math.floor((so.y + DY[so.side]) / MODULE);
    if (fx < 0 || fy < 0 || fx >= G || fy >= G || zoneOfModule[fy * G + fx] !== ZONE_HALL) return -1;
    const o = occ[fy * G + fx];
    if (o >= 0 && insts[o].role === "suite") return -1;
    return fy * G + fx;
  };
  const canPlace = (e: HotelLibEntry, t: Tile, mx: number, my: number): boolean => {
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    if (!fits(mx, my, mw, mh, e.set)) return false;
    if (e.def.role !== "suite") return true;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) if (front.has(y * G + x)) return false;
    const f = frontOf(t, mx, my);
    return f >= 0 && !(f >= my * G && Math.floor(f / G) < my + mh && f % G >= mx && f % G < mx + mw);
  };
  const place = (e: HotelLibEntry, t: Tile, mx: number, my: number): HotelInst => {
    const id = insts.length;
    if (e.def.role === "suite") front.add(frontOf(t, mx, my));
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) occ[y * G + x] = id;
    const inst: HotelInst = {
      id,
      tileId: e.def.id,
      role: e.def.role,
      name: e.def.name ?? null,
      type: e.def.type,
      zone: e.def.role === "hub" ? ZONE_BEVERLY : zoneOfSet(e.set),
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
  const centreOf = (i: HotelInst): [number, number] => [i.mx + i.mw / 2, i.my + i.mh / 2];

  // ---- THE WAY IN: the middle of the chosen edge, on the outer wall
  let startInst: HotelInst | null = null;
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
    if (!startInst) throw new Error("hotel: nowhere on the map's edge fits the service stair");
  }
  const far = (from: HotelInst, mx: number, my: number, mw: number, mh: number): number => {
    const [fx, fy] = centreOf(from);
    return Math.hypot(mx + mw / 2 - fx, my + mh / 2 - fy);
  };
  /** Place one of `pool` where `score` is highest. */
  const placeBest = (pool: HotelLibEntry[], score: (mx: number, my: number, mw: number, mh: number) => number, what: string): HotelInst => {
    let best: { e: HotelLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
    for (const e of pool)
      for (const t of e.variants) {
        const mw = t.w / MODULE;
        const mh = t.h / MODULE;
        for (let my = 0; my <= G - mh; my++)
          for (let mx = 0; mx <= G - mw; mx++) {
            if (!fits(mx, my, mw, mh, e.set)) continue;
            const sc = score(mx, my, mw, mh) + rnd() * 0.5;
            if (!best || sc > best.score) best = { e, t, mx, my, score: sc };
          }
      }
    if (!best) throw new Error(`hotel: nowhere fits ${what}`);
    return place(best.e, best.t, best.mx, best.my);
  };
  // the middle of the Main Hall: halfway between the way in and the line
  const hallDepthMid = (G - BOILER_ROWS) / 2;
  const centreDist = (mx: number, my: number, mw: number, mh: number): number => {
    const cx = mx + mw / 2;
    const cy = my + mh / 2;
    const along = edge === 0 || edge === 2 ? cx : cy;
    const dep = edge === 0 ? cy : edge === 2 ? G - cy : edge === 3 ? cx : G - cx;
    return Math.hypot(along - G / 2, dep - hallDepthMid);
  };
  // ---- THE BEVERLY ROOM: the hub, as near the middle of the hall as fits
  placeBest(hubs, (mx, my, mw, mh) => -centreDist(mx, my, mw, mh), "the Beverly Room");
  // ---- THE BOILER ROOM'S DOOR: on the line, as near the middle as fits
  const line = G - BOILER_ROWS;
  const gateInst = placeBest(
    gates,
    (mx, my, mw, mh) => {
      const near = edge === 0 ? my : edge === 2 ? G - (my + mh) : edge === 3 ? mx : G - (mx + mw);
      const along = edge === 0 || edge === 2 ? mx + mw / 2 : my + mh / 2;
      return (near === line ? 100 : 0) - Math.abs(along - G / 2);
    },
    "the Boiler Room's door",
  );
  // the module on the Main Hall side of the Boiler Room's door is never a
  // suite (a suite's back would wall the only way below stairs in)
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const fx = gateInst.mx + dx;
    const fy = gateInst.my + dy;
    if (fx >= 0 && fy >= 0 && fx < G && fy < G && zoneOfModule[fy * G + fx] === ZONE_HALL) front.add(fy * G + fx);
  }
  // ---- THE RUSTY DOOR: as far below stairs from the door as the map allows
  placeBest(goal, (mx, my, mw, mh) => far(gateInst, mx, my, mw, mh), "the rusty door");

  // ---- THE MINIMUMS: every room the library asks for at least N of, first,
  // wherever it fits (shuffled), so the register always has suites to name
  const spots: number[] = [];
  for (let i = 0; i < G * G; i++) spots.push(i);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const e of lib.filter((x) => (x.def.min ?? 0) > 0 && ["block", "suite"].includes(x.def.role))) {
    for (const m of spots) {
      if ((count.get(e.def.id) ?? 0) >= (e.def.min ?? 0)) break;
      const mx = m % G;
      const my = (m / G) | 0;
      const ok = e.variants.filter((t) => canPlace(e, t, mx, my));
      if (ok.length) place(e, pickOf(rnd, ok), mx, my);
    }
  }

  // ---- THE PACK: the rest, biggest first where it fits
  const blocks = lib.filter((e) => e.def.role === "block" || e.def.role === "suite");
  for (const pass of [0, 1])
    for (const m of spots) {
      if (occ[m] >= 0) continue;
      const mx0 = m % G;
      const my0 = (m / G) | 0;
      let best: { e: HotelLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
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
                const vs = e.variants.filter((t) => t.w === mw * MODULE && t.h === mh * MODULE && canPlace(e, t, mx, my));
                if (vs.length) best = { e, t: pickOf(rnd, vs), mx, my, score };
              }
            }
        }
      }
      if (best) place(best.e, best.t, best.mx, best.my);
    }
  const unmet = lib.filter((e) => (e.def.min ?? 0) > (count.get(e.def.id) ?? 0)).map((e) => e.def.id);

  // ---- THE DOORWAYS: a spanning tree over the rooms, then a share of the
  // rest. Between the zones ONLY through the Boiler Room's door.
  type Cand = { a: number; b: number; x: number; y: number; side: Side; cutA: number; cutB: number };
  const slotAt = new Set<string>();
  insts.forEach((inst, id) => tiles[id].sockets.forEach((so) => slotAt.add(`${id},${inst.x + so.x},${inst.y + so.y},${so.side}`)));
  const cutDepth = (id: number, gx: number, gy: number, side: Side): number => {
    if (slotAt.has(`${id},${gx},${gy},${side}`)) return 0;
    // a suite's one door is its numbered door: never cut another
    if (insts[id].role === "suite") return -1;
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
        // never a doorway through a set piece on the rim (a lift, a furnace…)
        if (t.pieces.some((p) => p.k !== "lamp" && p.x === x && p.y === y)) return -1;
        const c = t.cell[y * t.w + x];
        if (c === 1) break;
        if (c !== 2) return -1;
      }
      if (k > MODULE / 2) return -1;
      need = Math.max(need, k);
    }
    return need;
  };
  const zoneKind = (id: number): number => (insts[id].zone === ZONE_BOILER ? ZONE_BOILER : ZONE_HALL);
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
        if (insts[id].role === "suite" && insts[other].role === "suite") continue;
        // between the zones only through the gate
        if (zoneKind(id) !== zoneKind(other) && id !== gateInst.id && other !== gateInst.id) continue;
        const cutA = cutDepth(id, gx, gy, side);
        const cutB = cutDepth(other, nx, ny, ((side + 2) % 4) as Side);
        if (cutA < 0 || cutB < 0) continue;
        cands.push({ a: id, b: other, x: gx, y: gy, side, cutA, cutB });
      }
    }
  });
  const dRnd = rngFor(seed, salt("hh1:doors"));
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
  // a suite keeps its one door: never a second opened onto it
  const suiteOpen = new Set<number>();
  for (const c of open) for (const id of [c.a, c.b]) if (insts[id].role === "suite") suiteOpen.add(id);
  for (const c of cands) {
    if (open.has(c) || c.cutA + c.cutB !== 0 || dRnd() >= EXTRA_OPEN) continue;
    if ([c.a, c.b].some((id) => insts[id].role === "suite" && suiteOpen.has(id))) continue;
    // the zones meet at the gate ONCE: its line stays a wall but for the tree's door
    if (zoneKind(c.a) !== zoneKind(c.b)) continue;
    open.add(c);
    for (const id of [c.a, c.b]) if (insts[id].role === "suite") suiteOpen.add(id);
  }
  const cuts: { x: number; y: number; side: Side; depth: number }[] = [];
  for (const c of open) {
    if (c.cutA) cuts.push({ x: c.x, y: c.y, side: c.side, depth: c.cutA });
    if (c.cutB) cuts.push({ x: c.x + DX[c.side], y: c.y + DY[c.side], side: ((c.side + 2) % 4) as Side, depth: c.cutB });
  }

  const built = materialize(seed, size, insts, tiles, open, cuts);
  // ---- THE ROOM NUMBERS: every suite a number no scenery door carries, and
  // THE REGISTER naming one of them
  const nRnd = rngFor(seed, "hh1:rooms");
  const used = new Set<number>(sceneryNumbers(library));
  for (const st of built.suites) {
    let num = 0;
    do num = 100 * (1 + Math.floor(nRnd() * 4)) + 1 + Math.floor(nRnd() * 49);
    while (used.has(num));
    used.add(num);
    st.number = num;
  }
  const target = built.suites.length ? Math.floor(rngFor(seed, "hh1:register")() * built.suites.length) : -1;
  // what the service needs from the plan rides on the sector (server only)
  built.sector.hotel = { suites: built.suites.map((q) => ({ x: q.x, y: q.y, number: q.number, door: { ...q.door }, rect: { ...q.rect } })), target };
  return { ...built, insts, tiles, zoneOfModule, target, opened: open.size, tree, cuts: cuts.length, unmet };
}

function materialize(
  seed: number,
  size: number,
  insts: HotelInst[],
  tiles: Tile[],
  open: Set<{ a: number; b: number; x: number; y: number; side: Side }>,
  cuts: { x: number; y: number; side: Side; depth: number }[] = [],
): Pick<HotelPlan, "sector" | "register" | "suites" | "rustydoor" | "lifts" | "furnaces" | "nests" | "lostCells"> {
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
    districts: HOTEL_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
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
  let register: HotelPlan["register"] = null;
  let rustydoor: WallSite | null = null;
  const suites: SuiteSite[] = [];
  const lifts: WallSite[] = [];
  const furnaces: WallSite[] = [];
  const nests: { x: number; y: number }[] = [];
  const lampRnd = rngFor(seed, "hh1:lamps");
  for (const inst of insts) {
    const t = tiles[inst.id];
    const base = nextSpace;
    nextSpace += t.roomKinds.length;
    const lookCode = styleTable.styleOf(t.def.look);
    const stairCode = stairTable.styleOf(t.def.stairs);
    const ownZone = t.dia.types.indexOf(t.def.type);
    const alwaysLit = inst.role === "start" || inst.role === "hub";
    const below = inst.zone === ZONE_BOILER;
    const roll = (): number => {
      // the roll is spent for every fixture, lit room or not, so one room's
      // lights never shift another's
      const r = lampRnd();
      if (alwaysLit) return 0;
      const dead = below ? BOILER_DEAD : HALL_DEAD;
      const flick = below ? BOILER_FLICKER : HALL_FLICKER;
      return r < dead ? 1 : r < dead + flick ? 2 : 0;
    };
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
        if (t.deco[i]) {
          let b = t.deco[i];
          const k = hdecoKind(b);
          if (k === HDECO.lamp) b = hdecoByte(HDECO.lamp, roll());
          else if (k === HDECO.sconce) b = hdecoByte(HDECO.sconce, sconceSide(hdecoVar(b)) + 4 * roll());
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
      if (p.k === "entrance") doors.push({ x: site.x, y: site.y, edge: "NESW"[p.o] as Door["edge"], name: HOTEL_DOOR_NAME });
      else if (p.k === "rustydoor") rustydoor = site;
      else if (p.k === "register") register = { x: site.x, y: site.y };
      else if (p.k === "key") {
        const so = t.sockets[0];
        suites.push({
          x: site.x,
          y: site.y,
          number: 0,
          inst: inst.id,
          door: so ? { x: inst.x + so.x, y: inst.y + so.y, side: so.side } : { x: site.x, y: site.y, side: 2 },
          rect: { x: inst.x, y: inst.y, w: inst.w, h: inst.h },
        });
      }
      else if (p.k === "lift") lifts.push(site);
      else if (p.k === "furnace") furnaces.push(site);
      else if (p.k === "nest") nests.push({ x: site.x, y: site.y });
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
  if (doors.length !== 1) throw new Error(`hotel: the level carries ${doors.length} entrances (one door per level)`);
  s.doors = doors;
  // landmarks: every NAMED room
  const named = new Map<string, HotelInst[]>();
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
  return { sector: s, register, suites, rustydoor, lifts, furnaces, nests, lostCells };
}

export function generateHotelSector(seed: number, size: number): Sector {
  return planHotelSector(seed, size).sector;
}

/** Is this cell below stairs (the heat climbs while you stand in it)? */
export const hotelBelow = (s: Sector, x: number, y: number): boolean => s.section?.[y * s.size + x] === ZONE_BOILER;

export interface HotelReport extends SectorReport {
  register: boolean;
  rustydoor: boolean;
  suites: number;
  lifts: number;
  furnaces: number;
  nests: number;
  /** A set piece on a cell the placement law refuses — MUST be 0. */
  unlawful: number;
  lamps: number;
  deadLamps: number;
  /** Open edges between a Main Hall cell and a Boiler Room cell — the zones
   *  meet at the Boiler Room's door and nowhere else. */
  crossings: number;
}

/** The hotel's own report: the shared one, plus its pieces and its zones. */
export function validateHotelSector(s: Sector): HotelReport {
  const base = validateSector(s);
  const size = s.size;
  const deco = s.deco ?? new Uint8Array(size * size);
  const sec = s.section ?? new Uint8Array(size * size);
  let register = false;
  let rustydoor = false;
  let suites = 0;
  let lifts = 0;
  let furnaces = 0;
  let nests = 0;
  let unlawful = 0;
  let lamps = 0;
  let deadLamps = 0;
  let crossings = 0;
  const below = (i: number): boolean => sec[i] === ZONE_BOILER;
  for (let i = 0; i < size * size; i++) {
    const k = hdecoKind(deco[i]);
    const x = i % size;
    const y = (i / size) | 0;
    if (k === HDECO.register) register = true;
    if (k === HDECO.rustydoor) rustydoor = true;
    if (k === HDECO.key) suites++;
    if (k === HDECO.lift) lifts++;
    if (k === HDECO.furnace) furnaces++;
    if (k === HDECO.nest) nests++;
    if ((k === HDECO.register || k === HDECO.rustydoor || k === HDECO.key || k === HDECO.lift) && !placeable(s, x, y)) unlawful++;
    if (k === HDECO.lamp || k === HDECO.sconce) {
      lamps++;
      const st = k === HDECO.lamp ? hdecoVar(deco[i]) : hdecoVar(deco[i]) >> 2;
      if (st === 1) deadLamps++;
    }
    if (s.solid[i]) continue;
    // an open edge north or west into a cell of the other zone
    if (y > 0 && !s.wallN[i] && !s.solid[i - size] && below(i) !== below(i - size)) crossings++;
    if (x > 0 && !s.wallW[i] && !s.solid[i - 1] && below(i) !== below(i - 1)) crossings++;
  }
  return { ...base, register, rustydoor, suites, lifts, furnaces, nests, unlawful, lamps, deadLamps, crossings };
}

export { sectorFingerprint, distanceMap, ZONE_HALL, ZONE_BEVERLY, ZONE_BOILER };
