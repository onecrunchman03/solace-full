// LEVEL 0 — THE LOBBY, BUILT FROM HAND-MADE ROOMS (v4, sector A4).
//
// Josh, 2026-09-27: "All three levels now" — and "Just put only one door per
// level for entering let's make it easy."
//
// A3 (July 2026) was carved by rules: a BSP partition into districts, each
// filled by its recipe. It had the right texture — the classic backrooms is
// yellow rooms packed WALL TO WALL, drywall between them, no rock anywhere —
// but every room was a rule's idea of a room. This is the hand-made-rooms
// model the other levels use, with one difference that follows from that
// texture: Level 0 is a LATTICE, not a network grown through doorways.
//
//   1. THE LIBRARY. Every room is drawn in lobby-rooms.json (Level 0's
//      dialect: lobby-tiles.ts; the map editor: Admin Panel → Map editor),
//      each a whole number of 10-cell MODULES, filled edge to edge, with a
//      doorway slot on every module side.
//   2. THE ENTRANCE — the one way in and out — goes at the middle of one edge
//      of the map, its door marked on the outer wall, as Level 0's doors have
//      always been.
//   3. THE LANDMARKS are spread across the map before anything else.
//   4. THE PACK. Every other module is filled, biggest rooms first where they
//      fit, the room types clustered into districts (a region map over the
//      modules), so offices sit with offices and the warrens run together.
//   5. THE DOORWAYS. Rooms that tile a rectangle are all adjacent to
//      something, so a spanning tree over them connects the whole level; one
//      slot per tree edge opens, and then a share of the rest, for the loops
//      and junctions Level 0 is made of.
//
// Walls are DERIVED (a wall between two rooms unless a joined slot opens it)
// plus each room's own drywall. The reach check at the end must find nothing
// to seal. THE DOOR to Level 1 and THE KEY are placed by lore.ts, as before:
// THE DOOR at the deepest cell from the entrance, the key in the landmark
// farthest from it.

import { type Sector, type District, type DistrictType, type Door, idx, rngFor, distanceMap, validateSector, sectorFingerprint, isPitCell, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { LOBBY_TYPES, MODULE, LOBBY_DOOR_NAME, type LobbyType } from "./lobby-vocab";
import { type TileDef, type Tile, type Lint, tileVariants, thinWall, SIDE_CH, type Side } from "./tiles";
import { lintLobbyTile } from "./lobby-tiles";
import LIBRARY_JSON from "./lobby-rooms.json";
import { seatWallProps } from "./kitseat";

/** The library as shipped. */
export const LOBBY_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** Of the slots the spanning tree doesn't need, the share that open anyway —
 *  Level 0 is a place of junctions, not a maze with one answer. */
const EXTRA_OPEN = 0.5;
/** Region seeds per thousand modules (the district map's grain). 55 since
 *  the Sep 2026 condense: a smaller map wants smaller districts, or three of
 *  them fill it. */
const REGIONS = 55;
/** How often each room type is picked as a district. THE YELLOW ROOMS (Josh,
 *  Sep 2026: "keep most of the map the same color pallet with a couple of
 *  room with different variance"): every district wears the classic palette
 *  — the three papers and the carpet, manila's yellowed paper, the unlit
 *  rooms' same paper in the dark. The rooms that break it are ACCENTS below,
 *  never a district. */
const TYPE_ODDS: Readonly<Record<LobbyType, number>> = { classic: 0.3, offices: 0.13, warrens: 0.11, halls: 0.1, pillars: 0.1, terraces: 0.06, sublevel: 0.05, atrium: 0.04, manila: 0.05, unlit: 0.04, panelled: 0, storage: 0, restrooms: 0 };
/** THE ACCENTS: room types whose look breaks the yellow — tiled restrooms,
 *  wood panelling, bare concrete storage. Beside their landmarks (The
 *  Washroom, The Boardroom) they turn up as ACCENT_ROOMS single rooms,
 *  spread across the map, the odd room you stumble into. */
const ACCENTS: readonly LobbyType[] = ["restrooms", "panelled", "storage"];
const ACCENT_ROOMS = 3;

export interface LobbyLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  /** Size in modules. */
  mw: number;
  mh: number;
}

export function loadLobbyLibrary(defs: readonly TileDef[] = LOBBY_LIBRARY, lax = false): LobbyLibEntry[] {
  const out: LobbyLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintLobbyTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`lobby: room "${def.id}" is broken — ${l.errors[0]}`);
    out.push({ def, base: l.tile, variants: l.errors.length ? [] : tileVariants(l.tile), lint: { errors: l.errors, warnings: l.warnings }, mw: l.tile.w / MODULE, mh: l.tile.h / MODULE });
  }
  return out;
}

export interface LobbyInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  type: string;
  /** Module coordinates and size. */
  mx: number;
  my: number;
  mw: number;
  mh: number;
  /** Cell coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LobbyPlan {
  sector: Sector;
  insts: LobbyInst[];
  tiles: Tile[];
  /** Space id per cell (0 = rock). */
  space: Int32Array;
  /** Slots opened (the tree's plus the extras) and the tree's share. */
  opened: number;
  tree: number;
  /** Open cells the reach check sealed — MUST be 0. */
  lostCells: number;
  /** Rooms the library asks for (min) that didn't fit. */
  unmet: string[];
  /** The district type per module (the region map). */
  regions: string[];
}

const pick = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];

export function planLobbySector(seed: number, size: number, library: readonly TileDef[] = LOBBY_LIBRARY): LobbyPlan {
  const lib = loadLobbyLibrary(library);
  const start = lib.filter((e) => e.def.role === "start");
  if (!start.length) throw new Error("lobby: the library needs a start room (the one with The Entrance)");
  const G = Math.floor((size - 2) / MODULE); // modules per side
  const O = Math.floor((size - G * MODULE) / 2); // cell offset of module (0,0)
  const occ = new Int32Array(G * G).fill(-1);
  const insts: LobbyInst[] = [];
  const tiles: Tile[] = [];
  const count = new Map<string, number>();
  const rnd = rngFor(seed, "lb4:pack");

  // ---- the district map: a region type per module (Voronoi over seeds)
  const nSeeds = Math.max(Object.keys(TYPE_ODDS).length + 4, Math.round((G * G * REGIONS) / 1000));
  const seeds: { x: number; y: number; t: LobbyType }[] = [];
  const types = Object.entries(TYPE_ODDS) as [LobbyType, number][];
  const rollType = (): LobbyType => {
    let r = rnd() * types.reduce((a, [, w]) => a + w, 0);
    for (const [t, w] of types) if ((r -= w) <= 0) return t;
    return "classic";
  };
  // DEALT, NOT ROLLED (Josh, Sep 2026: "more variations in its rooms type and
  // look"). Rolling each seed let a small map come out with two office blocks
  // and no atrium at all; dealing from a deck that holds every type once, then
  // weighted draws for the rest, guarantees the whole range on every map.
  const deck: LobbyType[] = types.filter(([, w]) => w > 0).map(([t]) => t);
  while (deck.length < nSeeds) deck.push(rollType());
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  for (let k = 0; k < nSeeds; k++) seeds.push({ x: rnd() * G, y: rnd() * G, t: deck[k] });
  const region: LobbyType[] = [];
  for (let my = 0; my < G; my++)
    for (let mx = 0; mx < G; mx++) {
      let best = seeds[0];
      let bd = Infinity;
      for (const s of seeds) {
        const d = (s.x - mx - 0.5) ** 2 + (s.y - my - 0.5) ** 2;
        if (d < bd) ((bd = d), (best = s));
      }
      region.push(best.t);
    }

  const fits = (mx: number, my: number, mw: number, mh: number): boolean => {
    if (mx < 0 || my < 0 || mx + mw > G || my + mh > G) return false;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) if (occ[y * G + x] >= 0) return false;
    return true;
  };
  const place = (e: LobbyLibEntry, t: Tile, mx: number, my: number): LobbyInst => {
    const id = insts.length;
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) occ[y * G + x] = id;
    const inst: LobbyInst = { id, tileId: e.def.id, role: e.def.role, name: e.def.name ?? null, type: e.def.type, mx, my, mw, mh, x: O + mx * MODULE, y: O + my * MODULE, w: t.w, h: t.h };
    insts.push(inst);
    tiles.push(t);
    count.set(e.def.id, (count.get(e.def.id) ?? 0) + 1);
    return inst;
  };

  // ---- THE ENTRANCE: the middle of one edge, its door on the outer wall
  {
    const e = pick(rnd, start);
    const edge = Math.floor(rnd() * 4) as Side;
    const cands = e.variants.filter((t) => t.pieces.some((p) => p.k === "entrance" && p.o === edge));
    if (!cands.length) throw new Error("lobby: the start room can't face its entrance onto the map's edge");
    const t = pick(rnd, cands);
    const dp = t.pieces.find((p) => p.k === "entrance")!;
    // the door's wall must BE the map's edge: the door cell on the room's rim
    const mw = t.w / MODULE;
    const mh = t.h / MODULE;
    const mid = (n: number): number => Math.max(0, Math.min(G - n, Math.floor((G - n) / 2)));
    const mx = edge === 3 ? 0 : edge === 1 ? G - mw : mid(mw);
    const my = edge === 0 ? 0 : edge === 2 ? G - mh : mid(mh);
    const onRim = edge === 0 ? dp.y === 0 : edge === 2 ? dp.y === t.h - 1 : edge === 3 ? dp.x === 0 : dp.x === t.w - 1;
    if (!onRim) throw new Error("lobby: the entrance must stand against the start room's outer wall");
    place(e, t, mx, my);
  }

  // ---- THE LANDMARKS, spread out: each as far from the rest as it can get
  const marks = lib.filter((e) => e.def.role === "landmark");
  const centreOf = (i: LobbyInst): [number, number] => [i.mx + i.mw / 2, i.my + i.mh / 2];
  for (const e of marks) {
    const want = Math.max(1, e.def.min ?? 1);
    for (let k = 0; k < want; k++) {
      let best: { t: Tile; mx: number; my: number; score: number } | null = null;
      for (let tries = 0; tries < 60; tries++) {
        const t = pick(rnd, e.variants);
        const mw = t.w / MODULE;
        const mh = t.h / MODULE;
        const mx = 1 + Math.floor(rnd() * (G - mw - 1));
        const my = 1 + Math.floor(rnd() * (G - mh - 1));
        if (!fits(mx, my, mw, mh)) continue;
        const far = Math.min(...insts.map((i) => Math.hypot(centreOf(i)[0] - mx - mw / 2, centreOf(i)[1] - my - mh / 2)));
        const score = far + rnd() * 2;
        if (!best || score > best.score) best = { t, mx, my, score };
      }
      if (best) place(e, best.t, best.mx, best.my);
    }
  }

  // ---- THE ACCENTS: a few rooms that break the palette, spread like the
  // landmarks — one of each accent type first, then any, small rooms only
  {
    const small = lib.filter((e) => e.def.role === "block" && ACCENTS.includes(e.def.type as LobbyType) && e.mw * e.mh <= 2);
    for (let k = 0; k < ACCENT_ROOMS; k++) {
      const want = ACCENTS[k % ACCENTS.length];
      const pool = small.filter((e) => e.def.type === want);
      const choice = pool.length ? pool : small;
      if (!choice.length) break;
      let best: { e: LobbyLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
      for (let tries = 0; tries < 60; tries++) {
        const e = pick(rnd, choice);
        const t = pick(rnd, e.variants);
        const mw = t.w / MODULE;
        const mh = t.h / MODULE;
        const mx = 1 + Math.floor(rnd() * (G - mw - 1));
        const my = 1 + Math.floor(rnd() * (G - mh - 1));
        if (!fits(mx, my, mw, mh)) continue;
        const far = Math.min(...insts.map((i) => Math.hypot(centreOf(i)[0] - mx - mw / 2, centreOf(i)[1] - my - mh / 2)));
        const score = far + rnd() * 2;
        if (!best || score > best.score) best = { e, t, mx, my, score };
      }
      if (best) place(best.e, best.t, best.mx, best.my);
    }
  }

  // ---- THE PACK: the rest, district by district, biggest first where it fits
  // (never an accent: those are placed above and nowhere else)
  const blocks = lib.filter((e) => e.def.role === "block" && !ACCENTS.includes(e.def.type as LobbyType));
  const order: number[] = [];
  for (let i = 0; i < G * G; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // two passes: the big rooms (2×2 modules and up) first, where their own
  // district is, while there is still room for them — then everything else
  for (const pass of [0, 1])
  for (const m of order) {
    if (occ[m] >= 0) continue;
    const mx0 = m % G;
    const my0 = (m / G) | 0;
    let best: { e: LobbyLibEntry; t: Tile; mx: number; my: number; score: number } | null = null;
    for (const e of blocks) {
      if (e.def.max !== undefined && (count.get(e.def.id) ?? 0) >= e.def.max) continue;
      if (pass === 0 && (e.mw * e.mh < 4 || region[m] !== e.def.type)) continue;
      // every placement of this room's footprint that covers the module
      for (const [mw, mh] of e.mw === e.mh ? [[e.mw, e.mh]] : [[e.mw, e.mh], [e.mh, e.mw]]) {
        for (let dy = 0; dy < mh; dy++) {
          for (let dx = 0; dx < mw; dx++) {
            const mx = mx0 - dx;
            const my = my0 - dy;
            if (!fits(mx, my, mw, mh)) continue;
            let match = 0;
            if (pass === 0 && rnd() > 0.35) continue;
            for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) if (region[y * G + x] === e.def.type) match++;
            const area = mw * mh;
            const seen = count.get(e.def.id) ?? 0;
            const score = (match / area) * 12 + Math.sqrt(area) * 1.6 + (e.def.weight ?? 1) * (0.4 + rnd()) * 3 - seen * 0.25;
            if (!best || score > best.score) {
              const vs = e.variants.filter((t) => t.w === mw * MODULE && t.h === mh * MODULE);
              if (vs.length) best = { e, t: pick(rnd, vs), mx, my, score };
            }
          }
        }
      }
    }
    if (best) place(best.e, best.t, best.mx, best.my);
  }
  const unmet = lib.filter((e) => (e.def.min ?? 0) > (count.get(e.def.id) ?? 0)).map((e) => e.def.id);

  // ---- THE DOORWAYS: a spanning tree over the rooms, then a share of the rest
  // A module side between two rooms is a CANDIDATE: both carry a slot there.
  type Cand = { a: number; b: number; x: number; y: number; side: Side };
  const slotAt = new Map<string, number>(); // "inst,cellx,celly,side" → socket index
  insts.forEach((inst, id) => tiles[id].sockets.forEach((so, k) => slotAt.set(`${id},${inst.x + so.x},${inst.y + so.y},${so.side}`, k)));
  const cands: Cand[] = [];
  const DXs = [0, 1, 0, -1];
  const DYs = [-1, 0, 1, 0];
  insts.forEach((inst, id) => {
    tiles[id].sockets.forEach((so) => {
      if (so.side !== 1 && so.side !== 2) return; // each shared side once: from its west / north owner
      const gx = inst.x + so.x;
      const gy = inst.y + so.y;
      const nx = gx + DXs[so.side];
      const ny = gy + DYs[so.side];
      const mx = Math.floor((nx - O) / MODULE);
      const my = Math.floor((ny - O) / MODULE);
      if (mx < 0 || my < 0 || mx >= G || my >= G) return;
      const other = occ[my * G + mx];
      if (other < 0 || other === id) return;
      if (!slotAt.has(`${other},${nx},${ny},${(so.side + 2) % 4}`)) return;
      cands.push({ a: id, b: other, x: gx, y: gy, side: so.side as Side });
    });
  });
  const dRnd = rngFor(seed, "lb4:doors");
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(dRnd() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
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
  for (const c of cands) if (!open.has(c) && dRnd() < EXTRA_OPEN) open.add(c);

  const built = materialize(seed, size, insts, tiles, open);
  const regions = region.slice();
  return { ...built, insts, tiles, opened: open.size, tree, unmet, regions };
}

function materialize(seed: number, size: number, insts: LobbyInst[], tiles: Tile[], open: Set<{ a: number; b: number; x: number; y: number; side: Side }>): { sector: Sector; space: Int32Array; lostCells: number } {
  const n = size * size;
  // every distinct room style (look, lights, sound) once; cells point in
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
    districts: LOBBY_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
    landmarks: [],
    doors: [],
    kit: [],
    look: new Uint16Array(n),
    styles: styleTable.styles,
    stairSpecs: stairTable.specs,
  };
  const space = new Int32Array(n);
  let nextSpace = 1;
  const doors: Door[] = [];
  for (const inst of insts) {
    const t = tiles[inst.id];
    const base = nextSpace;
    nextSpace += t.roomKinds.length;
    // the room's look override, worn by its own-type cells only
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
        // floor no door of the room reaches: drawn, never entered (tiles.ts scenery)
        if (t.scenery[i]) s.background[gi] = 1;
        s.floor[gi] = t.hgt[i];
        if (t.lid[i] !== LID_NONE) (s.lid ??= new Int8Array(n).fill(LID_NONE))[gi] = t.lid[i];
        if (t.stair[i] >= 0) {
          (s.stair ??= new Int8Array(n).fill(STAIR_NONE))[gi] = t.stair[i];
          if (stairCode) (s.stairStyle ??= new Uint8Array(n))[gi] = stairCode;
        }
        s.district[gi] = t.zone[i];
        if (lookCode && t.zone[i] === ownZone) s.look![gi] = lookCode;
        // the room's own drywall
        if (t.wallN[i]) s.wallN[gi] = 1;
        if (t.wallW[i]) s.wallW[gi] = 1;
      }
    }
    // a prop or marker with a chance appears in that share of the copies,
    // rolled per copy from the seed (the same on every boot)
    t.props.forEach((pl, k) => {
      if (pl.c < 100 && copyRoll(seed, inst.id, k) * 100 >= pl.c) return;
      const { c: _c, text, ...rest } = pl;
      s.kit!.push({ ...rest, x: inst.x + pl.x, y: inst.y + pl.y, ...(text ? { text } : {}) });
    });
    t.marks.forEach((m, k) => {
      if ((m.chance ?? 100) < 100 && copyRoll(seed, inst.id, k, 1) * 100 >= m.chance!) return;
      (s.marks ??= []).push({ ...m, x: inst.x + m.x, y: inst.y + m.y });
    });
    for (const p of t.pieces) if (p.k === "entrance") doors.push({ x: inst.x + p.x, y: inst.y + p.y, edge: SIDE_CH[p.o] as Door["edge"], name: LOBBY_DOOR_NAME });
  }
  const opened = new Set<number>();
  const openEdge = (x: number, y: number, side: Side): void => {
    if (side === 0) opened.add((y * size + x) * 2);
    else if (side === 2) opened.add(((y + 1) * size + x) * 2);
    else if (side === 3) opened.add((y * size + x) * 2 + 1);
    else opened.add((y * size + x + 1) * 2 + 1);
  };
  for (const inst of insts) for (const d of tiles[inst.id].inner) openEdge(inst.x + d.x, inst.y + d.y, d.side);
  for (const c of open) {
    // a slot is two lanes
    for (let q = 0; q < 2; q++) openEdge(c.side === 2 ? c.x + q : c.x, c.side === 1 ? c.y + q : c.y, c.side);
  }
  // walls between rooms
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
  if (doors.length !== 1) throw new Error(`lobby: the level carries ${doors.length} entrances (one door per level)`);
  s.doors = doors;
  // landmarks: the named set pieces (numbered when the library repeats one)
  const named = new Map<string, LobbyInst[]>();
  for (const inst of insts) if (inst.name && inst.role === "landmark") named.set(inst.name, [...(named.get(inst.name) ?? []), inst]);
  for (const [name, list] of named) {
    list.forEach((inst, k) => {
      const id = s.landmarks.length + 1;
      s.landmarks.push({ id, name: list.length === 1 ? name : `${name} No. ${k + 1}`, x: inst.x, y: inst.y, w: inst.w, h: inst.h });
      for (let y = inst.y; y < inst.y + inst.h; y++) for (let x = inst.x; x < inst.x + inst.w; x++) s.landmark[y * size + x] = id;
    });
  }
  // THE REACH CHECK: nothing the entrance can't reach survives (a shaft is a
  // place you fall into, not one you walk to)
  const d0 = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  let lostCells = 0;
  for (let i = 0; i < n; i++) {
    if (s.solid[i] || s.background[i] || d0[i] >= 0 || isPitCell(s, i % size, (i / size) | 0)) continue;
    lostCells++;
    s.solid[i] = 1;
  }
  // wall props onto the face each copy actually backs on to (Nov 2026 polish round)
  seatWallProps(s);
  return { sector: s, space, lostCells };
}

export function generateLobbySector(seed: number, size: number): Sector {
  return planLobbySector(seed, size).sector;
}

export function validateLobbySector(s: Sector): SectorReport {
  return validateSector(s);
}

export { sectorFingerprint, distanceMap, idx, thinWall };
