// LEVEL 4 — THE ABANDONED OFFICE, BUILT FROM HAND-MADE ROOMS (sector O1).
//
// Josh, 2026-10-12: the next level in order, the keycard as its way down, the
// Temp as its creature, about the Station's size. The design is BACKROOMS.md →
// "LEVEL 4 — THE ABANDONED OFFICE".
//
// It is the Station's LATTICE (worldgen-station.ts), with the office's steps:
//
//   1. THE LIBRARY. Every room is drawn in office-rooms.json (the dialect:
//      office-tiles.ts), a whole number of 8-cell modules, filled edge to
//      edge, a doorway slot in the middle of every module side.
//   2. THE BLINK ZONES. The module grid is dealt into BLINK_ZONES zones — a
//      Voronoi over seeds spread as far apart as the grid allows. Every room
//      sits wholly inside one, so a room's troffers always dip together.
//   3. THE LIFT — the one way in, from the Station's shutter — at the middle
//      of one edge of the map.
//   4. THE SECURITY OFFICE (the keycard) as far from the lift as the map
//      allows; THE STAIRWELL DOOR as far from both as the map allows.
//   5. THE PACK and THE DOORWAYS, exactly as the Station: the rest filled
//      biggest first, a spanning tree over the rooms (knocking a doorway
//      through a corridor's flank only where the tree needs it), then a share
//      of the other slots.
//   6. THE LIGHTS: every troffer is rolled from the seed — most of them DEAD,
//      a few flickering — except in the Lift Lobby, which is always lit (it
//      is the level's safe room).
//
// Walls are DERIVED (a wall between two rooms unless a joined slot opens it),
// and the reach check at the end must find nothing to seal.

import { type Sector, type District, type DistrictType, type Door, rngFor, distanceMap, validateSector, sectorFingerprint, isPitCell, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { OFFICE_TYPES, MODULE, SLOT_AT, BLINK_ZONES, OFFICE_DOOR_NAME, STAIRDOOR_NAME, ODECO, odecoByte, odecoKind, odecoVar, LAMP_REACH } from "./office-vocab";
import { type TileDef, type Tile, type Lint, tileVariants, type Side, DX, DY } from "./tiles";
import { lintOfficeTile } from "./office-tiles";
import { placeable } from "./placement";
import LIBRARY_JSON from "./office-rooms.json";
import { seatWallProps } from "./kitseat";

/** The library as shipped. */
export const OFFICE_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** SECTOR O1 IS FROZEN (Oct 2026): seed and size, and the fingerprint below,
 *  are what the server boots and checks. 130 cells = 16 modules a side — the Station's size, as
 *  Josh agreed. */
export const SECTOR_O = Object.freeze({ id: "O1", seed: 20261012, size: 130 });
/** Captured at freeze time; regenerating the office must always produce this. */
export const SECTOR_O_FINGERPRINT = "sha256:58a746fb79934055be63d46f6188e7e3e8d6649189abf452db2eae7b29d494f5";

/** Of the slots the spanning tree doesn't need, the share that open anyway —
 *  more than the Station: an office floor has its rooms opening on to each
 *  other, and a dead end with the Temp behind you is the level at its worst. */
const EXTRA_OPEN = 0.4;
/** THE LIGHTS, rolled per troffer from the seed: MOST are dead (the
 *  references — the floor is lit in pools, and the dark between them is
 *  where the Temp moves), a few flicker, the rest work. */
export const LAMP_DEAD = 0.55;
export const LAMP_FLICKER = 0.1;
/** The rooms whose outer walls carry windows (not the closets, the server
 *  room, the washrooms, the security office or the stairwell). */
const WINDOWED = new Set(["hallway", "cubicles", "openplan", "conference", "corneroffice", "kitchenette", "reception", "records", "copyroom"]);

export interface OfficeLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  mw: number;
  mh: number;
}

export function loadOfficeLibrary(defs: readonly TileDef[] = OFFICE_LIBRARY, lax = false): OfficeLibEntry[] {
  const out: OfficeLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintOfficeTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`office: room "${def.id}" is broken — ${l.errors[0]}`);
    out.push({ def, base: l.tile, variants: l.errors.length ? [] : tileVariants(l.tile), lint: { errors: l.errors, warnings: l.warnings }, mw: l.tile.w / MODULE, mh: l.tile.h / MODULE });
  }
  return out;
}

export interface OfficeInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  type: string;
  /** The blink zone the room is in, 1..BLINK_ZONES. */
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

/** A wall-backed set piece on the map: the cell you stand on to use it, and
 *  the wall it hangs on. */
export interface WallSite {
  x: number;
  y: number;
  side: Side;
}

export interface OfficePlan {
  sector: Sector;
  insts: OfficeInst[];
  tiles: Tile[];
  /** Blink zone 1..BLINK_ZONES per module (row-major). */
  zoneOfModule: number[];
  /** Where the keycard lies. */
  keycard: { x: number; y: number } | null;
  /** The stairwell door. */
  stairdoor: WallSite | null;
  opened: number;
  tree: number;
  /** Doorways knocked through a room's solid flank (no slot there). */
  cuts: number;
  /** Open cells the reach check sealed — MUST be 0. */
  lostCells: number;
  /** Rooms the library asks for (min) that didn't fit. */
  unmet: string[];
}

const pickOf = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];

export function planOfficeSector(seed: number, size: number, library: readonly TileDef[] = OFFICE_LIBRARY): OfficePlan {
  const lib = loadOfficeLibrary(library);
  const start = lib.filter((e) => e.def.role === "start");
  const goal = lib.filter((e) => e.def.role === "goal");
  const keyRooms = lib.filter((e) => e.def.role === "key");
  if (!start.length) throw new Error("office: the library needs a start room (the one with the lift)");
  if (!goal.length) throw new Error("office: the library needs a goal room (the one with the stairwell door)");
  if (!keyRooms.length) throw new Error("office: the library needs a key room (the one with the keycard)");
  const G = Math.floor((size - 2) / MODULE);
  const O = Math.floor((size - G * MODULE) / 2);
  const occ = new Int32Array(G * G).fill(-1);
  const insts: OfficeInst[] = [];
  const tiles: Tile[] = [];
  const count = new Map<string, number>();
  const rnd = rngFor(seed, "of1:pack");

  // ---- THE BLINK ZONES: seeds spread by farthest-point, then Voronoi
  const seeds: [number, number][] = [[rnd() * G, rnd() * G]];
  while (seeds.length < BLINK_ZONES) {
    let best: [number, number] = [0, 0];
    let bd = -1;
    for (let k = 0; k < 400; k++) {
      const c: [number, number] = [rnd() * G, rnd() * G];
      const d = Math.min(...seeds.map(([sx, sy]) => (sx - c[0]) ** 2 + (sy - c[1]) ** 2));
      if (d > bd) ((bd = d), (best = c));
    }
    seeds.push(best);
  }
  const zoneOfModule: number[] = [];
  for (let my = 0; my < G; my++)
    for (let mx = 0; mx < G; mx++) {
      let best = 0;
      let bd = Infinity;
      seeds.forEach(([sx, sy], k) => {
        const d = (sx - mx - 0.5) ** 2 + (sy - my - 0.5) ** 2;
        if (d < bd) ((bd = d), (best = k));
      });
      zoneOfModule.push(best + 1);
    }

  /** Free, inside the grid, and wholly inside ONE zone. */
  const fits = (mx: number, my: number, mw: number, mh: number): boolean => {
    if (mx < 0 || my < 0 || mx + mw > G || my + mh > G) return false;
    const z = zoneOfModule[my * G + mx];
    for (let y = my; y < my + mh; y++)
      for (let x = mx; x < mx + mw; x++) if (occ[y * G + x] >= 0 || zoneOfModule[y * G + x] !== z) return false;
    return true;
  };
  const place = (e: OfficeLibEntry, t: Tile, mx: number, my: number): OfficeInst => {
    const id = insts.length;
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) occ[y * G + x] = id;
    const inst: OfficeInst = {
      id,
      tileId: e.def.id,
      role: e.def.role,
      name: e.def.name ?? null,
      type: e.def.type,
      zone: zoneOfModule[my * G + mx],
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
  const centreOf = (i: OfficeInst): [number, number] => [i.mx + i.mw / 2, i.my + i.mh / 2];

  // ---- THE LIFT: the middle of one edge, on the outer wall. Its room may
  // not straddle two zones, so the mid point slides along the edge until it
  // fits.
  let startInst: OfficeInst | null = null;
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
    if (!startInst) throw new Error("office: nowhere on the map's edge fits the lift lobby");
  }
  const far = (from: OfficeInst, mx: number, my: number, mw: number, mh: number): number => {
    const [fx, fy] = centreOf(from);
    return Math.hypot(mx + mw / 2 - fx, my + mh / 2 - fy);
  };

  /** Place one of `pool` where `score` is highest. */
  const placeBest = (pool: OfficeLibEntry[], score: (mx: number, my: number, mw: number, mh: number) => number, what: string): OfficeInst => {
    let best: { e: OfficeLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
    for (const e of pool)
      for (const t of e.variants) {
        const mw = t.w / MODULE;
        const mh = t.h / MODULE;
        for (let my = 0; my <= G - mh; my++)
          for (let mx = 0; mx <= G - mw; mx++) {
            if (!fits(mx, my, mw, mh)) continue;
            const sc = score(mx, my, mw, mh) + rnd() * 0.5;
            if (!best || sc > best.score) best = { e, t, mx, my, score: sc };
          }
      }
    if (!best) throw new Error(`office: nowhere fits ${what}`);
    return place(best.e, best.t, best.mx, best.my);
  };
  // ---- THE SECURITY OFFICE: as far from the lift as the map allows
  const keyInst = placeBest(keyRooms, (mx, my, mw, mh) => far(startInst!, mx, my, mw, mh), "the security office");
  // ---- THE STAIRWELL DOOR: as far from both as the map allows
  placeBest(goal, (mx, my, mw, mh) => Math.min(far(startInst!, mx, my, mw, mh), far(keyInst, mx, my, mw, mh)), "the stairwell door");

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
      let best: { e: OfficeLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
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

  // ---- THE DOORWAYS: a spanning tree over the rooms, then a share of the
  // rest. Native slots first; a doorway is CUT through a corridor's solid
  // flank only where the tree needs it to join the level (the Station's rule).
  type Cand = { a: number; b: number; x: number; y: number; side: Side; cutA: number; cutB: number };
  const slotAt = new Set<string>();
  insts.forEach((inst, id) => tiles[id].sockets.forEach((so) => slotAt.add(`${id},${inst.x + so.x},${inst.y + so.y},${so.side}`)));
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
  const dRnd = rngFor(seed, "of1:doors");
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
  for (const c of cands) if (!open.has(c) && c.cutA + c.cutB === 0 && dRnd() < EXTRA_OPEN) open.add(c);
  const cuts: { x: number; y: number; side: Side; depth: number }[] = [];
  for (const c of open) {
    if (c.cutA) cuts.push({ x: c.x, y: c.y, side: c.side, depth: c.cutA });
    if (c.cutB) cuts.push({ x: c.x + DX[c.side], y: c.y + DY[c.side], side: ((c.side + 2) % 4) as Side, depth: c.cutB });
  }

  const built = materialize(seed, size, insts, tiles, open, cuts);
  return { ...built, insts, tiles, zoneOfModule, opened: open.size, tree, cuts: cuts.length, unmet };
}

function materialize(
  seed: number,
  size: number,
  insts: OfficeInst[],
  tiles: Tile[],
  open: Set<{ a: number; b: number; x: number; y: number; side: Side }>,
  cuts: { x: number; y: number; side: Side; depth: number }[] = [],
): { sector: Sector; keycard: OfficePlan["keycard"]; stairdoor: WallSite | null; lostCells: number } {
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
    districts: OFFICE_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
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
  let keycard: OfficePlan["keycard"] = null;
  let stairdoor: WallSite | null = null;
  const lampRnd = rngFor(seed, "of1:lamps");
  for (const inst of insts) {
    const t = tiles[inst.id];
    const base = nextSpace;
    nextSpace += t.roomKinds.length;
    const lookCode = styleTable.styleOf(t.def.look);
    const stairCode = stairTable.styleOf(t.def.stairs);
    const ownZone = t.dia.types.indexOf(t.def.type);
    const alwaysLit = inst.role === "start";
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
          // a troffer's state, rolled per lamp from the seed (the roll is
          // spent for every lamp, lobby or not, so a lobby's lights never
          // shift another room's)
          if (odecoKind(b) === ODECO.lamp) {
            const r = lampRnd();
            b = odecoByte(ODECO.lamp, alwaysLit ? 0 : r < LAMP_DEAD ? 1 : r < LAMP_DEAD + LAMP_FLICKER ? 2 : 0);
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
      if (p.k === "entrance") doors.push({ x: site.x, y: site.y, edge: "NESW"[p.o] as Door["edge"], name: OFFICE_DOOR_NAME });
      else if (p.k === "stairdoor") stairdoor = site;
      else if (p.k === "keycard") keycard = { x: site.x, y: site.y };
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
  // WINDOWS look OUT: one drawn on a wall with the building behind it would
  // show rain inside the building, so only those on the building's edge —
  // nothing but solid between the wall and the map's rim — stay; the rest
  // are plain wall.
  for (let i = 0; i < n; i++) {
    if (odecoKind(s.deco![i]) !== ODECO.window) continue;
    const side = odecoVar(s.deco![i]) as Side;
    let bx = (i % size) + DX[side];
    let by = ((i / size) | 0) + DY[side];
    let outside = true;
    for (; bx >= 0 && by >= 0 && bx < size && by < size; bx += DX[side], by += DY[side]) {
      if (!s.solid[by * size + bx] || space[by * size + bx]) {
        outside = false;
        break;
      }
    }
    if (!outside) s.deco![i] = 0;
  }
  // THE BUILDING'S EDGE IS GLAZED (the references: windows, rain, fog, a sky
  // that never changes): every third cell of an outer wall in the rooms that
  // would have windows carries one, wherever nothing else is on that cell.
  const typeAt = (i: number): string => OFFICE_TYPES[s.district[i]] ?? "";
  for (let i = 0; i < n; i++) {
    if (s.solid[i] || s.deco![i] || !WINDOWED.has(typeAt(i))) continue;
    const x = i % size;
    const y = (i / size) | 0;
    if ((x + y) % 3 !== 1) continue;
    for (let side = 0 as Side; side < 4; side = (side + 1) as Side) {
      const bx = x + DX[side];
      const by = y + DY[side];
      if (bx < 0 || by < 0 || bx >= size || by >= size) continue;
      const b = by * size + bx;
      if (!s.solid[b] || space[b]) continue;
      s.deco![i] = odecoByte(ODECO.window, side);
      break;
    }
  }
  if (doors.length !== 1) throw new Error(`office: the level carries ${doors.length} entrances (one door per level)`);
  s.doors = doors;
  // landmarks: every NAMED room
  const named = new Map<string, OfficeInst[]>();
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
  return { sector: s, keycard, stairdoor, lostCells };
}

export function generateOfficeSector(seed: number, size: number): Sector {
  return planOfficeSector(seed, size).sector;
}

/** Is this cell LIT — within LAMP_REACH of a working (or flickering) troffer?
 *  The Temp is watched only where it is lit. Dead troffers light nothing. */
export function officeLitCells(s: Sector): Uint8Array {
  const size = s.size;
  const lit = new Uint8Array(size * size);
  const deco = s.deco;
  if (!deco) return lit;
  for (let i = 0; i < size * size; i++) {
    if (odecoKind(deco[i]) !== ODECO.lamp || odecoVar(deco[i]) === 1) continue;
    const lx = i % size;
    const ly = (i / size) | 0;
    for (let y = Math.max(0, ly - LAMP_REACH); y <= Math.min(size - 1, ly + LAMP_REACH); y++)
      for (let x = Math.max(0, lx - LAMP_REACH); x <= Math.min(size - 1, lx + LAMP_REACH); x++) lit[y * size + x] = 1;
  }
  return lit;
}

export interface OfficeReport extends SectorReport {
  keycard: boolean;
  stairdoor: boolean;
  /** The keycard or the stairwell door on a cell the placement law refuses —
   *  MUST be 0. */
  unlawful: number;
  lamps: number;
  deadLamps: number;
  windows: number;
  /** Share of open floor that is lit. */
  litShare: number;
  /** How many blink zones the open floor uses (BLINK_ZONES, all of them). */
  zones: number;
}

/** The office's own report: the shared one, plus its pieces and its light. */
export function validateOfficeSector(s: Sector): OfficeReport {
  const base = validateSector(s);
  const size = s.size;
  const deco = s.deco ?? new Uint8Array(size * size);
  let keycard = false;
  let stairdoor = false;
  let unlawful = 0;
  let lamps = 0;
  let deadLamps = 0;
  let windows = 0;
  let open = 0;
  let litOpen = 0;
  const lit = officeLitCells(s);
  const zones = new Set<number>();
  for (let i = 0; i < size * size; i++) {
    const k = odecoKind(deco[i]);
    const x = i % size;
    const y = (i / size) | 0;
    if (k === ODECO.keycard || k === ODECO.stairdoor) {
      if (k === ODECO.keycard) keycard = true;
      else stairdoor = true;
      if (!placeable(s, x, y)) unlawful++;
    }
    if (k === ODECO.lamp) {
      lamps++;
      if (odecoVar(deco[i]) === 1) deadLamps++;
    }
    if (k === ODECO.window) windows++;
    if (!s.solid[i] && !s.background[i]) {
      open++;
      if (lit[i]) litOpen++;
      if (s.section?.[i]) zones.add(s.section[i]);
    }
  }
  return { ...base, keycard, stairdoor, unlawful, lamps, deadLamps, windows, litShare: open ? litOpen / open : 0, zones: zones.size };
}

export { sectorFingerprint, distanceMap };
