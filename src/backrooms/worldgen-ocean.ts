// LEVEL 7 — THALASSOPHOBIA, BUILT FROM HAND-MADE BLOCKS (sector T1).
//
// Josh, 2026-10-14: THE DIVE (the subway stair at the bottom of a sunken
// plaza, the Diving Helmet the key), THE THING BELOW, and the map as proposed.
// The design is BACKROOMS.md → "LEVEL 7 — THALASSOPHOBIA".
//
// A drowned city on a lattice of 10-cell blocks:
//
//   1. THE LIBRARY. Every block is drawn in ocean-rooms.json (the dialect:
//      ocean-tiles.ts): a whole number of modules, mostly open water.
//   2. THE ZONES. The Drop is the DROP_RING rings of modules round the map's
//      rim; the city is everything inside.
//   3. THE TOWER — the way in, up through the hatch from Lights Out — at the
//      middle of one side of the city, on its first ring, looking out over
//      the Drop.
//   4. THE SUNKEN PLAZA as far across the city from the tower as fits.
//   5. THE MINIMUMS, then THE PACK, as every lattice level.
//   6. THE FLOORS: a water type takes its zone's depth (ocean-vocab.ts); the
//      rest their drawn heights. The water stands at WATER_LEVEL everywhere.
//   7. THE WALLS: only round the tower's rooms — never between two outdoor
//      cells, which is what makes the blocks one sea.
//   8. THE DIVING HELMET: of every helmet spot the blocks drew, one — far from
//      the tower AND from the plaza, so finding it and finding the way down are
//      two different searches.
//
// The reach check at the end must find nothing to seal: every roof can be
// climbed onto from a swim (the climb rule on the EFFECTIVE floor — a swimmer
// floats at the surface).

import { type Sector, type District, type DistrictType, type Door, rngFor, distanceMap, validateSector, sectorFingerprint, isPitCell, WATER_NONE, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { OCEAN_TYPES, MODULE, DROP_RING, ZONE_TOWER, ZONE_CITY, ZONE_DROP, OCEAN_DEPTH, WATER_LEVEL, OCEAN_DOOR_NAME, TDECO, tdecoKind, HELMET_SPOTS_MIN, type OceanType } from "./ocean-vocab";
import { type TileDef, type Tile, type Lint, tileVariants, type Side, DX, DY } from "./tiles";
import { lintOceanTile } from "./ocean-tiles";
import { placeable } from "./placement";
import LIBRARY_JSON from "./ocean-rooms.json";
import { seatWallProps } from "./kitseat";

/** The library as shipped. */
export const OCEAN_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** SECTOR T1 (Oct 2026): seed and size, and the fingerprint below, are what
 *  the server boots and checks. 162 cells = 16 modules a side and a one-cell
 *  rim. */
export const SECTOR_T = Object.freeze({ id: "T1", seed: 20261015, size: 162 });
/** Captured at freeze time; regenerating Thalassophobia must always produce
 *  this. */
export const SECTOR_T_FINGERPRINT = "sha256:c007ffc28c0a36ce60f14c08148c24f92263481f3defd06d866bff675a56c9ba";

/** The helmet is drawn from the best share of the spots (by distance from the
 *  way in and from the plaza), so it is always far, never the same. */
export const HELMET_TOP_SHARE = 0.3;

export interface OceanLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  mw: number;
  mh: number;
  set: string;
}

export function loadOceanLibrary(defs: readonly TileDef[] = OCEAN_LIBRARY, lax = false): OceanLibEntry[] {
  const out: OceanLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintOceanTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`ocean: block "${def.id}" is broken — ${l.errors[0]}`);
    const set = String(Array.isArray(def.set) ? def.set[0] : def.set);
    out.push({ def, base: l.tile, variants: l.errors.length ? [] : tileVariants(l.tile), lint: { errors: l.errors, warnings: l.warnings }, mw: l.tile.w / MODULE, mh: l.tile.h / MODULE, set });
  }
  return out;
}

export interface OceanInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  type: string;
  /** ZONE_CITY or ZONE_DROP (the tower's own cells are ZONE_TOWER). */
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

export interface WallSite {
  x: number;
  y: number;
  side: Side;
}

export interface OceanPlan {
  sector: Sector;
  insts: OceanInst[];
  tiles: Tile[];
  /** The zone of every module (row-major): ZONE_CITY or ZONE_DROP. */
  zoneOfModule: number[];
  /** The subway stair at the bottom of the plaza. */
  subway: WallSite | null;
  /** Every spot the helmet may lie on, and the one it does. */
  helmetSpots: { x: number; y: number }[];
  helmet: { x: number; y: number } | null;
  /** Open cells the reach check sealed — MUST be 0. */
  lostCells: number;
  /** Blocks the library asks for (min) that didn't fit. */
  unmet: string[];
}

const pickOf = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];

export const PLAN_ATTEMPTS = 24;

export function planOceanSector(seed: number, size: number, library: readonly TileDef[] = OCEAN_LIBRARY): OceanPlan {
  let last: OceanPlan | null = null;
  for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt++) {
    last = planOnce(seed, size, library, attempt);
    if (last.lostCells === 0 && !last.unmet.length && last.helmet && last.subway && last.helmetSpots.length >= HELMET_SPOTS_MIN) return last;
  }
  return last!;
}

function planOnce(seed: number, size: number, library: readonly TileDef[], attempt: number): OceanPlan {
  const salt = (label: string): string => (attempt ? `${label}:${attempt}` : label);
  const lib = loadOceanLibrary(library);
  const byRole = (r: string): OceanLibEntry[] => lib.filter((e) => e.def.role === r);
  const start = byRole("start");
  const goal = byRole("goal");
  if (!start.length) throw new Error("ocean: the library needs a start block (the tower)");
  if (!goal.length) throw new Error("ocean: the library needs a goal block (the sunken plaza)");
  const G = Math.floor((size - 2) / MODULE);
  const O = Math.floor((size - G * MODULE) / 2);
  const occ = new Int32Array(G * G).fill(-1);
  const insts: OceanInst[] = [];
  const tiles: Tile[] = [];
  const count = new Map<string, number>();
  const rnd = rngFor(seed, salt("ot1:pack"));

  // ---- THE ZONES: the Drop round the rim, the city inside
  const ring = (mx: number, my: number): number => Math.min(mx, my, G - 1 - mx, G - 1 - my);
  const zoneOfModule: number[] = [];
  for (let my = 0; my < G; my++) for (let mx = 0; mx < G; mx++) zoneOfModule.push(ring(mx, my) < DROP_RING ? ZONE_DROP : ZONE_CITY);
  const zoneOfSet = (set: string): number => (set === "drop" ? ZONE_DROP : ZONE_CITY);

  const fits = (mx: number, my: number, mw: number, mh: number, set: string): boolean => {
    if (mx < 0 || my < 0 || mx + mw > G || my + mh > G) return false;
    const z = zoneOfSet(set);
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) if (occ[y * G + x] >= 0 || zoneOfModule[y * G + x] !== z) return false;
    return true;
  };
  const place = (e: OceanLibEntry, t: Tile, mx: number, my: number): OceanInst => {
    const id = insts.length;
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) occ[y * G + x] = id;
    const inst: OceanInst = { id, tileId: e.def.id, role: e.def.role, name: e.def.name ?? null, type: e.def.type, zone: zoneOfSet(e.set), mx, my, mw, mh, x: O + mx * MODULE, y: O + my * MODULE, w: t.w, h: t.h };
    insts.push(inst);
    tiles.push(t);
    count.set(e.def.id, (count.get(e.def.id) ?? 0) + 1);
    return inst;
  };
  const centreOf = (i: OceanInst): [number, number] => [i.mx + i.mw / 2, i.my + i.mh / 2];

  // ---- THE TOWER: the middle of one side of the city, on its first ring
  let startInst: OceanInst | null = null;
  {
    const edge = Math.floor(rnd() * 4) as Side;
    const e = pickOf(rnd, start);
    const t = pickOf(rnd, e.variants);
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    const mid = (n: number, m: number): number => Math.floor((n - m) / 2);
    const mx = edge === 3 ? DROP_RING : edge === 1 ? G - DROP_RING - mw : mid(G, mw);
    const my = edge === 0 ? DROP_RING : edge === 2 ? G - DROP_RING - mh : mid(G, mh);
    if (!fits(mx, my, mw, mh, e.set)) throw new Error("ocean: the tower doesn't fit on the city's edge");
    startInst = place(e, t, mx, my);
  }
  // ---- THE SUNKEN PLAZA: as far across the city from the tower as fits
  {
    const [sx, sy] = centreOf(startInst);
    let best: { e: OceanLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
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
    if (!best) throw new Error("ocean: nowhere in the city fits the sunken plaza");
    place(best.e, best.t, best.mx, best.my);
  }

  // ---- THE MINIMUMS, then THE PACK
  const spots: number[] = [];
  for (let i = 0; i < G * G; i++) spots.push(i);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const e of lib.filter((x) => (x.def.min ?? 0) > 0 && x.def.role === "block")) {
    for (const m of spots) {
      if ((count.get(e.def.id) ?? 0) >= (e.def.min ?? 0)) break;
      const ok = e.variants.filter((t) => fits(m % G, (m / G) | 0, t.w / MODULE, t.h / MODULE, e.set));
      if (ok.length) place(e, pickOf(rnd, ok), m % G, (m / G) | 0);
    }
  }
  const blocks = lib.filter((e) => e.def.role === "block");
  for (const m of spots) {
    if (occ[m] >= 0) continue;
    const mx = m % G;
    const my = (m / G) | 0;
    // a WEIGHTED DRAW (not the best score): the city is a mix, and a block
    // already used often is a little less likely again
    const cands: { e: OceanLibEntry; vs: Tile[]; w: number }[] = [];
    for (const e of blocks) {
      if (e.def.max !== undefined && (count.get(e.def.id) ?? 0) >= e.def.max) continue;
      const vs = e.variants.filter((t) => fits(mx, my, t.w / MODULE, t.h / MODULE, e.set));
      if (vs.length) cands.push({ e, vs, w: (e.def.weight ?? 1) / (1 + (count.get(e.def.id) ?? 0) * 0.03) });
    }
    let r = rnd() * cands.reduce((a, c) => a + c.w, 0);
    for (const c of cands) {
      r -= c.w;
      if (r <= 0) {
        place(c.e, pickOf(rnd, c.vs), mx, my);
        break;
      }
    }
  }
  const unmet = lib.filter((e) => (e.def.min ?? 0) > (count.get(e.def.id) ?? 0)).map((e) => e.def.id);

  const built = materialize(seed, size, insts, tiles);
  // ---- THE DIVING HELMET: far from the tower AND from the plaza
  let helmet: OceanPlan["helmet"] = null;
  const s = built.sector;
  const lawful = built.helmetSpots.filter((p) => placeable(s, p.x, p.y));
  if (lawful.length && built.subway) {
    const fromIn = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    const fromPlaza = distanceMap(s, [{ x: built.subway.x, y: built.subway.y }]);
    const scored = lawful
      .map((p) => ({ p, d: fromIn[p.y * size + p.x], h: fromPlaza[p.y * size + p.x] }))
      .filter((q) => q.d >= 0 && q.h >= 0)
      // far from BOTH: the nearer of the two distances leads
      .map((q) => ({ p: q.p, score: Math.min(q.d, q.h) + 0.2 * (q.d + q.h) }))
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * HELMET_TOP_SHARE)));
    if (top.length) helmet = { ...top[Math.floor(rngFor(seed, "ot1:helmet")() * top.length)].p };
  }
  s.ocean = { helmet, helmetSpots: built.helmetSpots.map((p) => ({ ...p })), subway: built.subway ? { ...built.subway } : null };
  return { ...built, helmet, insts, tiles, zoneOfModule, unmet };
}

/** The space every outdoor cell shares: no wall is ever built inside it. */
const OUTDOOR = 1;

function materialize(seed: number, size: number, insts: OceanInst[], tiles: Tile[]): Pick<OceanPlan, "sector" | "subway" | "helmetSpots" | "lostCells"> {
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
    districts: OCEAN_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
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
  let nextSpace = OUTDOOR + 1;
  const doors: Door[] = [];
  let subway: WallSite | null = null;
  const helmetSpots: { x: number; y: number }[] = [];
  for (const inst of insts) {
    const t = tiles[inst.id];
    const base = nextSpace;
    nextSpace += t.roomKinds.length;
    const lookCode = styleTable.styleOf(t.def.look);
    const stairCode = stairTable.styleOf(t.def.stairs);
    const types = t.dia.types as readonly OceanType[];
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const i = y * t.w + x;
        if (!t.cell[i]) continue;
        const gi = (inst.y + y) * size + inst.x + x;
        const type = types[t.zone[i]];
        const tower = type === "seatower";
        space[gi] = tower ? base + t.room[i] : OUTDOOR;
        s.solid[gi] = t.cell[i] === 2 ? 1 : 0;
        if (t.scenery[i]) s.background[gi] = 1;
        s.floor[gi] = OCEAN_DEPTH[type] ?? t.hgt[i];
        if (t.lid[i] !== LID_NONE) (s.lid ??= new Int8Array(n).fill(LID_NONE))[gi] = t.lid[i];
        if (t.stair[i] >= 0) {
          (s.stair ??= new Int8Array(n).fill(STAIR_NONE))[gi] = t.stair[i];
          if (stairCode) (s.stairStyle ??= new Uint8Array(n))[gi] = stairCode;
        }
        s.district[gi] = t.zone[i];
        s.section![gi] = tower ? ZONE_TOWER : inst.zone;
        if (lookCode) s.look![gi] = lookCode;
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
      if (p.k === "entrance") doors.push({ x: site.x, y: site.y, edge: "NESW"[p.o] as Door["edge"], name: OCEAN_DOOR_NAME });
      else if (p.k === "subway") subway = site;
      else if (p.k === "helmet") helmetSpots.push({ x: site.x, y: site.y });
    }
  }
  // THE WALLS: only where the tower's rooms meet something else, unless a
  // doorway the block drew opens the edge
  const opened = new Set<number>();
  const openEdge = (x: number, y: number, side: Side): void => {
    if (side === 0) opened.add((y * size + x) * 2);
    else if (side === 2) opened.add(((y + 1) * size + x) * 2);
    else if (side === 3) opened.add((y * size + x) * 2 + 1);
    else opened.add((y * size + x + 1) * 2 + 1);
  };
  for (const inst of insts) for (const d of tiles[inst.id].inner) openEdge(inst.x + d.x, inst.y + d.y, d.side);
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
  if (doors.length !== 1) throw new Error(`ocean: the level carries ${doors.length} entrances (one door per level)`);
  s.doors = doors;
  // THE WATER: one surface, at WATER_LEVEL; a swimmer floats on it
  buildOceanWater(s);
  // landmarks: every NAMED block
  const named = new Map<string, OceanInst[]>();
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
  if (lostCells) buildOceanWater(s);
  // wall props onto the face each copy actually backs on to (Nov 2026 polish round)
  seatWallProps(s);
  return { sector: s, subway, helmetSpots, lostCells };
}

/** The water and the effective floor: every open cell below the waterline is
 *  in the water, and a swimmer there stands (floats) at the surface. */
function buildOceanWater(s: Sector): void {
  const n = s.size * s.size;
  s.water = new Int8Array(n);
  s.eff = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const wet = !s.solid[i] && s.floor[i] < WATER_LEVEL;
    s.water[i] = wet ? WATER_LEVEL : WATER_NONE;
    s.eff[i] = wet ? WATER_LEVEL : s.floor[i];
  }
}

export function generateOceanSector(seed: number, size: number): Sector {
  return planOceanSector(seed, size).sector;
}

/** The room type of a cell. */
export function oceanTypeAt(s: Sector, x: number, y: number): OceanType | null {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return null;
  return (s.districts[s.district[y * s.size + x]]?.type as OceanType | undefined) ?? null;
}

/** Is this cell in the water (any depth)? */
export function oceanWet(s: Sector, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.size || y >= s.size) return false;
  const i = y * s.size + x;
  return !s.solid[i] && !!s.water && s.water[i] !== WATER_NONE;
}

export interface OceanReport extends SectorReport {
  subway: boolean;
  helmetSpots: number;
  /** A helmet spot the placement law refuses — MUST be 0. */
  unlawful: number;
  /** Cells in the water, and how many of them are in the Drop. */
  wetCells: number;
  dropCells: number;
  /** Dry cells you can stand on out of the water. */
  dryCells: number;
  /** The subway stair's floor (steps). */
  subwayFloor: number | null;
}

/** Thalassophobia's own report: the shared one, plus its pieces and its sea. */
export function validateOceanSector(s: Sector): OceanReport {
  const base = validateSector(s);
  const size = s.size;
  const deco = s.deco ?? new Uint8Array(size * size);
  let subway = false;
  let subwayFloor: number | null = null;
  let helmetSpots = 0;
  let unlawful = 0;
  let wetCells = 0;
  let dropCells = 0;
  let dryCells = 0;
  for (let i = 0; i < size * size; i++) {
    const k = tdecoKind(deco[i]);
    const x = i % size;
    const y = (i / size) | 0;
    if (k === TDECO.subway) {
      subway = true;
      subwayFloor = s.floor[i];
    }
    if (k === TDECO.helmet) {
      helmetSpots++;
      if (!placeable(s, x, y)) unlawful++;
    }
    if (s.solid[i]) continue;
    if (oceanWet(s, x, y)) {
      wetCells++;
      if (s.section?.[i] === ZONE_DROP) dropCells++;
    } else dryCells++;
  }
  return { ...base, subway, subwayFloor, helmetSpots, unlawful, wetCells, dropCells, dryCells };
}

export { sectorFingerprint, distanceMap, ZONE_TOWER, ZONE_CITY, ZONE_DROP, DX, DY };
