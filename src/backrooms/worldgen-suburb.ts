// LEVEL 9 — THE SUBURBS, BUILT FROM HAND-MADE ROOMS (sector U1).
//
// Josh, 2026-10-30: "Go with your picks" — the front door, the Neighborhood
// Watch, a street grid. The design is BACKROOMS.md → "LEVEL 9 — THE SUBURBS".
//
// It is Lights Out's LATTICE (worldgen-lights.ts), laid as a neighbourhood:
//
//   1. THE LIBRARY. Every room is drawn in suburb-rooms.json (the dialect:
//      suburb-tiles.ts), a whole number of 8-cell modules, filled edge to
//      edge, a doorway slot in the middle of every module side.
//   2. THE WAY IN — the manhole's cul-de-sac — at the middle of one edge.
//   3. THE STREET GRID: streets along the rim at STREET_ROWS, the whole width;
//      cross streets at STREET_COLS from the first street to the last, the
//      middle one running on out to the manhole. At each street module the
//      piece is chosen whose road runs out of exactly the sides with street
//      next door; no wall between two street pieces (the SEAMS).
//   4. NUMBER 9, as far from the manhole as fits, its gate onto a street.
//   5. THE LOTS: the minimums, then the pack, biggest first, each house turned
//      so its front faces a street where it can.
//   6. THE DOORWAYS: a spanning tree, then nearly every lot onto its street
//      and a few gaps in the fences between neighbours.
//   7. THE HOUSE KEY: of every key spot the houses drew, one is chosen from the
//      far share, by the walk from the way in.
//
// Walls are DERIVED (a wall between two rooms unless a joined slot opens it),
// and the reach check at the end must find nothing to seal.

import { type Sector, type District, type DistrictType, type Door, rngFor, distanceMap, validateSector, sectorFingerprint, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { SUBURB_TYPES, MODULE, SLOT_AT, STREET_ROWS, STREET_COLS, ZONE_OUT, ZONE_IN, SUBURB_INDOOR_TYPES, SUBURB_SAFE_TYPES, MANHOLE_NAME, UDECO, udecoKind, udecoLit, KEY_SPOTS_MIN, LIGHT_R, type SuburbType } from "./suburb-vocab";
import { type TileDef, type Tile, type Lint, tileVariants, type Side, DX, DY } from "./tiles";
import { lintSuburbTile } from "./suburb-tiles";
import { placeable } from "./placement";
import LIBRARY_JSON from "./suburb-rooms.json";
import { seatWallProps } from "./kitseat";

/** The library as shipped. */
export const SUBURB_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** SECTOR U1: seed and size, and the fingerprint below, are what the server
 *  boots and checks. 162 cells = 20 modules a side and a one-cell rim. */
export const SECTOR_U = Object.freeze({ id: "U1", seed: 20261030, size: 162 });
/** Captured at freeze time; regenerating the Suburbs must always produce this. */
export const SECTOR_U_FINGERPRINT = "sha256:027879e9fc6e62c7162bc5714a46c810f7667ce5b41642dc8aa7f182d7e10ded";

/** Of the fence gaps the spanning tree doesn't need, the share that open. */
const EXTRA_OPEN_FENCE = 0.22;
/** A lot onto the street it touches: nearly always. */
const EXTRA_OPEN_STREET = 0.85;
/** The key is drawn from the best share of the spots (by distance from the
 *  way in), so it is always well into the neighbourhood, never the same. */
export const KEY_TOP_SHARE = 0.4;
/** How much a step from Number 9 counts against a step from the way in when
 *  the key is placed (it must be far from both). */
export const KEY_DOOR_WEIGHT = 1.3;

export interface SuburbLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  mw: number;
  mh: number;
  set: string;
}

export function loadSuburbLibrary(defs: readonly TileDef[] = SUBURB_LIBRARY, lax = false): SuburbLibEntry[] {
  const out: SuburbLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintSuburbTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`suburbs: room "${def.id}" is broken — ${l.errors[0]}`);
    const set = String(Array.isArray(def.set) ? def.set[0] : def.set);
    out.push({ def, base: l.tile, variants: l.errors.length ? [] : tileVariants(l.tile), lint: { errors: l.errors, warnings: l.warnings }, mw: l.tile.w / MODULE, mh: l.tile.h / MODULE, set });
  }
  return out;
}

export interface SuburbInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  type: string;
  set: string;
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

export interface SuburbPlan {
  sector: Sector;
  insts: SuburbInst[];
  tiles: Tile[];
  /** Is the module a street (row-major)? */
  streetModule: boolean[];
  /** Number 9's front door. */
  frontDoor: WallSite | null;
  /** Every spot the House Key may lie on, and the one it does. */
  keySpots: { x: number; y: number }[];
  key: { x: number; y: number } | null;
  opened: number;
  tree: number;
  /** Lots turned with their front to a street. */
  facing: number;
  /** Open cells the reach check sealed — MUST be 0. */
  lostCells: number;
  /** Rooms the library asks for (min) that didn't fit, and street modules
   *  no piece in the library could fill. */
  unmet: string[];
}

const pickOf = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];

/** How many times the planner re-rolls a map that left something unmet. */
export const PLAN_ATTEMPTS = 24;

export function planSuburbSector(seed: number, size: number, library: readonly TileDef[] = SUBURB_LIBRARY): SuburbPlan {
  let last: SuburbPlan | null = null;
  for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt++) {
    last = planOnce(seed, size, library, attempt);
    if (last.lostCells === 0 && !last.unmet.length && last.key && last.frontDoor && last.keySpots.length >= KEY_SPOTS_MIN) return last;
  }
  return last!;
}

/** Which side of a lot variant its FRONT is on: the edge nearest its dead
 *  porch light (null for a lot with no porch light). */
function frontOf(t: Tile): Side | null {
  const p = t.pieces.find((q) => q.k === "porchdead");
  if (!p) return null;
  const d = [p.y, t.w - 1 - p.x, t.h - 1 - p.y, p.x];
  let best = 0;
  for (let s = 1; s < 4; s++) if (d[s] < d[best]) best = s;
  return best as Side;
}

function planOnce(seed: number, size: number, library: readonly TileDef[], attempt: number): SuburbPlan {
  const salt = (label: string): string => (attempt ? `${label}:${attempt}` : label);
  const lib = loadSuburbLibrary(library);
  const byRole = (r: string): SuburbLibEntry[] => lib.filter((e) => e.def.role === r);
  const start = byRole("start");
  const goal = byRole("goal");
  if (!start.length) throw new Error("suburbs: the library needs a start room (the one with the manhole)");
  if (!goal.length) throw new Error("suburbs: the library needs a goal room (Number 9)");
  const G = Math.floor((size - 2) / MODULE);
  const O = Math.floor((size - G * MODULE) / 2);
  const occ = new Int32Array(G * G).fill(-1);
  const insts: SuburbInst[] = [];
  const tiles: Tile[] = [];
  const count = new Map<string, number>();
  const rnd = rngFor(seed, salt("su1:pack"));

  // ---- THE GRID: depth from the way in, along the rim
  const edge = Math.floor(rnd() * 4) as Side;
  const depthOf = (mx: number, my: number): number => (edge === 0 ? my : edge === 2 ? G - 1 - my : edge === 3 ? mx : G - 1 - mx);
  const alongOf = (mx: number, my: number): number => (edge === 0 || edge === 2 ? mx : my);
  const moduleAt = (d: number, a: number): [number, number] => (edge === 0 ? [a, d] : edge === 2 ? [a, G - 1 - d] : edge === 3 ? [d, a] : [G - 1 - d, a]);
  const MID = Math.floor((G - 1) / 2);
  const firstRow = STREET_ROWS[0];
  const lastRow = STREET_ROWS[STREET_ROWS.length - 1];
  const isStreetDA = (d: number, a: number): boolean => {
    if (d < 0 || a < 0 || d >= G || a >= G) return false;
    if (STREET_ROWS.includes(d)) return true;
    if (STREET_COLS.includes(a) && d > firstRow && d < lastRow) return true;
    return a === MID && d < firstRow; // the manhole's cul-de-sac (d 0 is the start room)
  };
  const streetModule: boolean[] = [];
  for (let my = 0; my < G; my++) for (let mx = 0; mx < G; mx++) streetModule.push(isStreetDA(depthOf(mx, my), alongOf(mx, my)));
  const isStreetM = (mx: number, my: number): boolean => mx >= 0 && my >= 0 && mx < G && my < G && streetModule[my * G + mx];

  const fits = (mx: number, my: number, mw: number, mh: number, set: string): boolean => {
    if (mx < 0 || my < 0 || mx + mw > G || my + mh > G) return false;
    for (let y = my; y < my + mh; y++)
      for (let x = mx; x < mx + mw; x++) {
        if (occ[y * G + x] >= 0) return false;
        if ((set === "street") !== streetModule[y * G + x]) return false;
      }
    return true;
  };
  const place = (e: SuburbLibEntry, t: Tile, mx: number, my: number): SuburbInst => {
    const id = insts.length;
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) occ[y * G + x] = id;
    const inst: SuburbInst = { id, tileId: e.def.id, role: e.def.role, name: e.def.name ?? null, type: e.def.type, set: e.set, mx, my, mw, mh, x: O + mx * MODULE, y: O + my * MODULE, w: t.w, h: t.h };
    insts.push(inst);
    tiles.push(t);
    count.set(e.def.id, (count.get(e.def.id) ?? 0) + 1);
    return inst;
  };
  const sideTo = (ax: number, ay: number, bx: number, by: number): Side => (bx > ax ? 1 : bx < ax ? 3 : by > ay ? 2 : 0);
  /** The sides of a piece its ROAD runs out of (both slot lanes road). */
  const roadSides = (t: Tile): Set<Side> => {
    const out = new Set<Side>();
    for (const sd of [0, 1, 2, 3] as Side[]) {
      const lanes: [number, number][] = sd === 0 || sd === 2 ? [[SLOT_AT, sd === 0 ? 0 : t.h - 1], [SLOT_AT + 1, sd === 0 ? 0 : t.h - 1]] : [[sd === 3 ? 0 : t.w - 1, SLOT_AT], [sd === 3 ? 0 : t.w - 1, SLOT_AT + 1]];
      if (lanes.every(([x, y]) => t.cell[y * t.w + x] === 1 && t.dia.types[t.zone[y * t.w + x]] === "road")) out.add(sd);
    }
    return out;
  };

  // ---- THE WAY IN: the manhole's cul-de-sac at the middle of the chosen edge
  let startInst: SuburbInst | null = null;
  {
    const e = pickOf(rnd, start);
    const [mx, my] = moduleAt(0, MID);
    const cands = e.variants.filter((t) => t.w === MODULE && t.h === MODULE && t.pieces.some((p) => p.k === "entrance" && p.o === edge));
    const t = cands.find((v) => {
      const rs = roadSides(v);
      const inward = ((edge + 2) % 4) as Side;
      return rs.size === 1 && rs.has(inward);
    });
    if (!t) throw new Error("suburbs: the manhole room must be one module with its road running inward, the manhole against the rim");
    streetModule[my * G + mx] = true;
    startInst = place(e, t, mx, my);
  }

  // ---- THE STREETS: at every street module, the piece whose road runs out of
  // exactly the sides with street next door (a street on the rim runs into the
  // rim). Then the seams between them.
  const seams: { a: number; b: number; side: Side }[] = [];
  const unmetStreet: string[] = [];
  const sr = rngFor(seed, salt("su1:streets"));
  const streetFam = lib.filter((e) => e.set === "street" && e.def.role === "block" && e.mw === 1 && e.mh === 1);
  for (let my = 0; my < G; my++)
    for (let mx = 0; mx < G; mx++) {
      if (!streetModule[my * G + mx] || occ[my * G + mx] >= 0) continue;
      const want = new Set<Side>();
      for (const sd of [0, 1, 2, 3] as Side[]) {
        const nx = mx + DX[sd];
        const ny = my + DY[sd];
        const off = nx < 0 || ny < 0 || nx >= G || ny >= G;
        if (off ? STREET_ROWS.includes(depthOf(mx, my)) : isStreetM(nx, ny)) want.add(sd);
      }
      const opts: { e: SuburbLibEntry; t: Tile }[] = [];
      for (const e of streetFam) {
        if (e.def.max !== undefined && (count.get(e.def.id) ?? 0) >= e.def.max) continue;
        for (const t of e.variants) {
          const got = roadSides(t);
          if (got.size === want.size && [...want].every((x) => got.has(x))) for (let w = 0; w < Math.max(1, Math.round((e.def.weight ?? 1) * 4)); w++) opts.push({ e, t });
        }
      }
      if (!opts.length) {
        unmetStreet.push(`street@${mx},${my}[${[...want].map((s) => "NESW"[s]).join("")}]`);
        continue;
      }
      const o = opts[Math.floor(sr() * opts.length)];
      place(o.e, o.t, mx, my);
    }
  for (const inst of insts) {
    if (inst.set !== "street") continue;
    for (const sd of [1, 2] as Side[]) {
      const nx = inst.mx + DX[sd];
      const ny = inst.my + DY[sd];
      if (!isStreetM(nx, ny)) continue;
      const other = occ[ny * G + nx];
      if (other >= 0 && insts[other].set === "street") seams.push({ a: inst.id, b: other, side: sd });
    }
  }

  // ---- NUMBER 9: as far from the manhole as fits, its gate onto a street
  let facing = 0;
  const frontToStreet = (t: Tile, mx: number, my: number, side: Side | null): boolean => {
    if (side === null) return false;
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    const cells: [number, number][] = [];
    if (side === 0) for (let x = mx; x < mx + mw; x++) cells.push([x, my - 1]);
    if (side === 2) for (let x = mx; x < mx + mw; x++) cells.push([x, my + mh]);
    if (side === 3) for (let y = my; y < my + mh; y++) cells.push([mx - 1, y]);
    if (side === 1) for (let y = my; y < my + mh; y++) cells.push([mx + mw, y]);
    return cells.length > 0 && cells.every(([x, y]) => isStreetM(x, y));
  };
  {
    const [sx, sy] = [startInst.mx + 0.5, startInst.my + 0.5];
    let best: { e: SuburbLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
    for (const e of goal)
      for (const t of e.variants) {
        const mw = t.w / MODULE;
        const mh = t.h / MODULE;
        const gates = new Set(t.sockets.map((s) => s.side));
        for (let my = 0; my <= G - mh; my++)
          for (let mx = 0; mx <= G - mw; mx++) {
            if (!fits(mx, my, mw, mh, e.set)) continue;
            // every gate the house has opens onto street
            if (![...gates].every((g) => frontToStreet(t, mx, my, g))) continue;
            const sc = Math.hypot(mx + mw / 2 - sx, my + mh / 2 - sy) + rnd() * 2;
            if (!best || sc > best.score) best = { e, t, mx, my, score: sc };
          }
      }
    if (!best) throw new Error("suburbs: nowhere fits Number 9 with its gate on a street");
    place(best.e, best.t, best.mx, best.my);
  }

  // ---- THE MINIMUMS, then THE PACK
  const spots: number[] = [];
  for (let i = 0; i < G * G; i++) spots.push(i);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const lots = lib.filter((e) => e.def.role === "block" && e.set === "lot");
  const score = (e: SuburbLibEntry, t: Tile, mx: number, my: number): number => {
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    const fr = frontOf(t);
    const faces = frontToStreet(t, mx, my, fr);
    const seen = count.get(e.def.id) ?? 0;
    return Math.sqrt(mw * mh) * 1.2 + (e.def.weight ?? 1) * (0.4 + rnd()) * 3 - seen * 0.25 + (fr === null ? 0 : faces ? 6 : -4);
  };
  for (const e of lots.filter((x) => (x.def.min ?? 0) > 0)) {
    for (const m of spots) {
      if ((count.get(e.def.id) ?? 0) >= (e.def.min ?? 0)) break;
      const mx = m % G;
      const my = (m / G) | 0;
      const ok = e.variants.filter((t) => fits(mx, my, t.w / MODULE, t.h / MODULE, e.set));
      if (!ok.length) continue;
      const t = ok.reduce((a, b) => (score(e, b, mx, my) > score(e, a, mx, my) ? b : a));
      place(e, t, mx, my);
    }
  }
  for (const pass of [0, 1])
    for (const m of spots) {
      if (occ[m] >= 0 || streetModule[m]) continue;
      const mx0 = m % G;
      const my0 = (m / G) | 0;
      let best: { e: SuburbLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
      for (const e of lots) {
        if (e.def.max !== undefined && (count.get(e.def.id) ?? 0) >= e.def.max) continue;
        if (pass === 0 && e.mw * e.mh < 2) continue;
        for (const t of e.variants) {
          const mw = t.w / MODULE;
          const mh = t.h / MODULE;
          for (let dy = 0; dy < mh; dy++)
            for (let dx = 0; dx < mw; dx++) {
              const mx = mx0 - dx;
              const my = my0 - dy;
              if (!fits(mx, my, mw, mh, e.set)) continue;
              const sc = score(e, t, mx, my);
              if (!best || sc > best.score) best = { e, t, mx, my, score: sc };
            }
        }
      }
      if (best) {
        if (frontToStreet(best.t, best.mx, best.my, frontOf(best.t))) facing++;
        place(best.e, best.t, best.mx, best.my);
      }
    }
  const unmet = [...lib.filter((e) => (e.def.min ?? 0) > (count.get(e.def.id) ?? 0)).map((e) => e.def.id), ...unmetStreet];
  for (let i = 0; i < G * G; i++) if (occ[i] < 0) unmet.push(`empty@${i % G},${(i / G) | 0}`);

  // ---- THE DOORWAYS: a spanning tree over the rooms, then the lots onto
  // their streets and a few gaps between neighbours
  type Cand = { a: number; b: number; x: number; y: number; side: Side };
  const slotAt = new Set<string>();
  insts.forEach((inst, id) => tiles[id].sockets.forEach((so) => slotAt.add(`${id},${inst.x + so.x},${inst.y + so.y},${so.side}`)));
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
        if (inst.set === "street" && insts[other].set === "street") continue; // seams
        if (!slotAt.has(`${id},${gx},${gy},${side}`) || !slotAt.has(`${other},${nx},${ny},${(side + 2) % 4}`)) continue;
        cands.push({ a: id, b: other, x: gx, y: gy, side });
      }
    }
  });
  const dRnd = rngFor(seed, salt("su1:doors"));
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(dRnd() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  // lot-onto-street first, so the tree prefers front gates to fence gaps
  const streetish = (c: Cand): boolean => insts[c.a].set === "street" || insts[c.b].set === "street";
  cands.sort((p, q) => Number(!streetish(p)) - Number(!streetish(q)));
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
    if (open.has(c)) continue;
    // Number 9 keeps to its one gate
    if (insts[c.a].role === "goal" || insts[c.b].role === "goal") continue;
    if (dRnd() >= (streetish(c) ? EXTRA_OPEN_STREET : EXTRA_OPEN_FENCE)) continue;
    open.add(c);
  }

  const built = materialize(seed, size, insts, tiles, open, seams);
  // ---- THE HOUSE KEY: well into the neighbourhood and away from Number 9,
  // drawn from the best share of the spots
  let key: SuburbPlan["key"] = null;
  const s = built.sector;
  const lawful = built.keySpots.filter((p) => placeable(s, p.x, p.y));
  if (lawful.length && built.frontDoor) {
    const fromIn = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    const fromDoor = distanceMap(s, [{ x: built.frontDoor.x, y: built.frontDoor.y }]);
    const scored = lawful
      .map((p) => ({ p, d: fromIn[p.y * size + p.x], h: fromDoor[p.y * size + p.x] }))
      .filter((q) => q.d >= 0 && q.h >= 0)
      // well into the neighbourhood AND a walk from Number 9: the key is
      // somewhere in the middle of the level, never by the door it opens
      .sort((a, b) => Math.min(b.d, b.h * KEY_DOOR_WEIGHT) - Math.min(a.d, a.h * KEY_DOOR_WEIGHT));
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * KEY_TOP_SHARE)));
    if (top.length) key = { ...top[Math.floor(rngFor(seed, "su1:key")() * top.length)].p };
  }
  // what the service needs from the plan rides on the sector (server only)
  s.suburb = { key, keySpots: built.keySpots.map((p) => ({ ...p })), frontDoor: built.frontDoor ? { ...built.frontDoor } : null };
  return { ...built, key, insts, tiles, streetModule, opened: open.size, tree, facing, unmet };
}

function materialize(
  seed: number,
  size: number,
  insts: SuburbInst[],
  tiles: Tile[],
  open: Set<{ a: number; b: number; x: number; y: number; side: Side }>,
  seams: { a: number; b: number; side: Side }[] = [],
): Pick<SuburbPlan, "sector" | "frontDoor" | "keySpots" | "lostCells"> {
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
    districts: SUBURB_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
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
  let frontDoor: WallSite | null = null;
  const keySpots: { x: number; y: number }[] = [];
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
        const zt = t.dia.types[t.zone[i]] as SuburbType;
        if (t.cell[i] === 1) s.section![gi] = SUBURB_INDOOR_TYPES.includes(zt) ? ZONE_IN : ZONE_OUT;
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
      if (p.k === "entrance") doors.push({ x: site.x, y: site.y, edge: "NESW"[p.o] as Door["edge"], name: MANHOLE_NAME });
      else if (p.k === "frontdoor") frontDoor = site;
      else if (p.k === "key") keySpots.push({ x: site.x, y: site.y });
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
  // THE SEAMS: where two street pieces meet, no wall between open cells
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
  if (doors.length !== 1) throw new Error(`suburbs: the level carries ${doors.length} entrances (one door per level)`);
  s.doors = doors;
  // landmarks: every NAMED room
  const named = new Map<string, SuburbInst[]>();
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
    if (s.solid[i] || s.background[i] || d0[i] >= 0) continue;
    lostCells++;
    s.solid[i] = 1;
  }
  // wall props onto the face each copy actually backs on to (Nov 2026 polish round)
  seatWallProps(s);
  return { sector: s, frontDoor, keySpots, lostCells };
}

export function generateSuburbSector(seed: number, size: number): Sector {
  return planSuburbSector(seed, size).sector;
}

/** The room type of a cell (null for a wall or out of the map). */
export function suburbTypeAt(s: Sector, x: number, y: number): SuburbType | null {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return null;
  const i = y * s.size + x;
  if (s.solid[i]) return null;
  return (s.districts[s.district[i]]?.type as SuburbType | undefined) ?? null;
}

/** Is this cell under a roof (a house or a garage)? */
export function suburbIndoor(s: Sector, x: number, y: number): boolean {
  const t = suburbTypeAt(s, x, y);
  return !!t && SUBURB_INDOOR_TYPES.includes(t);
}

/** Is this cell the way in (the manhole's cul-de-sac: nothing hunts there)? */
export function suburbSafe(s: Sector, x: number, y: number): boolean {
  const t = suburbTypeAt(s, x, y);
  return !!t && SUBURB_SAFE_TYPES.includes(t);
}

/** THE LIGHT: per cell, 1 inside the pool of a lit streetlight or a lit porch
 *  light (outdoors only — a pool doesn't reach through a house wall, and
 *  inside is the house's own business). Computed from the deco, so the client
 *  draws exactly the pools the server keeps. */
export function suburbLitMap(s: Sector): Uint8Array {
  const size = s.size;
  const lit = new Uint8Array(size * size);
  const deco = s.deco;
  if (!deco) return lit;
  const R = Math.ceil(LIGHT_R);
  for (let i = 0; i < size * size; i++) {
    if (!udecoLit(deco[i])) continue;
    const lx = (i % size) + 0.5;
    const ly = ((i / size) | 0) + 0.5;
    for (let y = Math.floor(ly) - R; y <= Math.floor(ly) + R; y++)
      for (let x = Math.floor(lx) - R; x <= Math.floor(lx) + R; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const j = y * size + x;
        if (s.solid[j] || s.section?.[j] !== ZONE_OUT) continue;
        if (Math.hypot(x + 0.5 - lx, y + 0.5 - ly) > LIGHT_R) continue;
        lit[j] = 1;
      }
  }
  return lit;
}

export interface SuburbReport extends SectorReport {
  frontDoor: boolean;
  keySpots: number;
  /** A set piece on a cell the placement law refuses — MUST be 0. */
  unlawful: number;
  lamps: number;
  litLamps: number;
  litCells: number;
  indoorCells: number;
  /** A key spot outdoors — MUST be 0. */
  badKey: number;
}

/** The Suburbs' own report: the shared one, plus its pieces and its light. */
export function validateSuburbSector(s: Sector): SuburbReport {
  const base = validateSector(s);
  const size = s.size;
  const deco = s.deco ?? new Uint8Array(size * size);
  const lit = suburbLitMap(s);
  let frontDoor = false;
  let keySpots = 0;
  let unlawful = 0;
  let lamps = 0;
  let litLamps = 0;
  let litCells = 0;
  let indoorCells = 0;
  let badKey = 0;
  for (let i = 0; i < size * size; i++) {
    const k = udecoKind(deco[i]);
    const x = i % size;
    const y = (i / size) | 0;
    if (k === UDECO.frontdoor) frontDoor = true;
    if (k === UDECO.key) keySpots++;
    if (k === UDECO.lamp) lamps++;
    if (udecoLit(deco[i])) litLamps++;
    if (lit[i]) litCells++;
    if ((k === UDECO.frontdoor || k === UDECO.key) && !placeable(s, x, y)) unlawful++;
    if (suburbIndoor(s, x, y)) indoorCells++;
    if (k === UDECO.key && !suburbIndoor(s, x, y)) badKey++;
  }
  return { ...base, frontDoor, keySpots, unlawful, lamps, litLamps, litCells, indoorCells, badKey };
}

export { sectorFingerprint, distanceMap, ZONE_OUT, ZONE_IN };
