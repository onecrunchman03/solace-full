// PIPE DREAMS — Level 2's DIALECT of the room library (tiles.ts is the
// format itself, shared by every level built from hand-drawn rooms).
//
// What is Pipe Dreams' own: its room types and zone letters, the furniture
// alphabet (lockers, pumps, turbines, tanks, racks, lamps, steam vents, the
// drain hatch, the pressure door and its fuse panel), the three DECKS every
// doorway sits on, and the one place a floor may drop — catwalk over an
// engine-hall pit. The names below are the ones the generator, the editor and
// the harnesses have always imported from here.

import {
  type Dialect,
  type Glyph,
  type Tile,
  type TileDef,
  type Lint,
  type Side,
  type LintCtx,
  parseTile as parseAny,
  lintTile as lintAny,
  DX,
  DY,
  SIDE_CH,
} from "./tiles";
import { type PipeType, PDECO, pdecoByte, MACHINES, TANKS, HALL_TYPES, BAND, PIPE_TYPES, WALL_A, WALL_B, FREE } from "./pipes-vocab";

export { type TileDef, type Tile, type Lint, type Side, type Piece, type Socket, type DoorSpec, DX, DY, SIDE_CH, opp, encodeH, transformTile, tileVariants, formatLibrary } from "./tiles";

/** Which stretch of the descent a tile belongs to. */
export type TileSet = "intake" | "staff" | "plant" | "machinery" | "vault" | "any";
/** What a tile does in the plan. */
export type TileRole = "start" | "goal" | "gallery" | "stair" | "hall" | "corridor" | "room" | "cap";

export const TILE_SETS: readonly TileSet[] = ["intake", "staff", "plant", "machinery", "vault", "any"];
export const TILE_ROLES: readonly TileRole[] = ["start", "goal", "gallery", "stair", "hall", "corridor", "room", "cap"];

/** Zone letters → room type. */
export const ZONES: Readonly<Record<string, PipeType>> = {
  g: "pipegallery",
  r: "servicering",
  c: "corridor",
  t: "tunnel",
  o: "office",
  s: "suite",
  b: "breakroom",
  k: "controlroom",
  e: "enginehall",
  w: "catwalk",
  h: "boilerhouse",
  a: "warehouse",
  m: "machineshop",
  d: "drainroom",
  v: "vault",
};
export const ZONE_OF: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(ZONES).map(([k, v]) => [v, k]));

export type PieceKind = "wallA" | "wallB" | "free" | "machine" | "tank" | "rack" | "lamp" | "vent" | "hatch" | "exitdoor" | "panel" | "lockeddoor";

/** The furniture layer's alphabet. */
export const GLYPHS: Readonly<Record<string, Glyph>> = {
  L: { k: "wallA", t: 0, label: "locker" },
  W: { k: "wallA", t: 1, label: "workbench" },
  K: { k: "wallA", t: 2, label: "wall cabinet" },
  C: { k: "wallA", t: 3, label: "console" },
  S: { k: "wallB", t: 0, label: "shelf" },
  U: { k: "wallB", t: 1, label: "counter" },
  B: { k: "wallB", t: 2, label: "breaker panel" },
  M: { k: "wallB", t: 3, label: "manifold" },
  b: { k: "free", t: 0, label: "bench" },
  t: { k: "free", t: 1, label: "table" },
  d: { k: "free", t: 2, label: "desk" },
  x: { k: "free", t: 3, label: "crates" },
  o: { k: "free", t: 4, label: "drums" },
  p: { k: "free", t: 5, label: "pallet" },
  q: { k: "free", t: 6, label: "cable drum" },
  z: { k: "free", t: 7, label: "stall" },
  P: { k: "machine", t: "pump", label: "pump 2×2" },
  G: { k: "machine", t: "generator", label: "generator 2×1" },
  I: { k: "machine", t: "cabinet", label: "electrical cabinet 1×1" },
  T: { k: "machine", t: "turbine", label: "turbine 6×3" },
  R: { k: "machine", t: "transformer", label: "transformer 2×2" },
  O: { k: "machine", t: "compressor", label: "compressor 2×1" },
  H: { k: "machine", t: "lathe", label: "lathe 2×1" },
  Y: { k: "machine", t: "press", label: "press 2×2" },
  Q: { k: "tank", t: "boiler", label: "boiler 5×3" },
  V: { k: "tank", t: "vtank", label: "vertical tank 2×2" },
  N: { k: "tank", t: "htank", label: "horizontal tank 4×2" },
  "=": { k: "rack", t: 0, label: "storage rack" },
  "*": { k: "lamp", t: 0, label: "ceiling lamp" },
  "~": { k: "vent", t: 0, label: "steam vent" },
  "@": { k: "hatch", t: 0, label: "the drain hatch (entrance)" },
  E: { k: "exitdoor", t: 0, label: "the pressure door (exit)" },
  F: { k: "panel", t: 0, label: "the fuse panel" },
  "+": { k: "lockeddoor", t: 0, label: "locked door (prop)" },
};

/** The labels for the editor's palette, grouped. */
export const GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Against a wall", glyphs: "LWKCSUBM" },
  { name: "Free-standing", glyphs: "btdxopqz" },
  { name: "Machines", glyphs: "PGITROHY" },
  { name: "Tanks", glyphs: "QVN" },
  { name: "Fixtures", glyphs: "=*~+" },
  { name: "Set pieces", glyphs: "@EF" },
];

/** Every name the palette offers, for tooltips and the harness. */
export const PIECE_NAMES = { WALL_A, WALL_B, FREE };

const BYTE: Record<string, (p: { t: number; o: number }) => number> = {
  machine: (p) => pdecoByte(PDECO.machine, p.t),
  tank: (p) => pdecoByte(PDECO.tank, p.t),
  rack: (p) => pdecoByte(PDECO.rack, p.o),
  wallA: (p) => pdecoByte(PDECO.wallA, p.t * 4 + p.o),
  wallB: (p) => pdecoByte(PDECO.wallB, p.t * 4 + p.o),
  free: (p) => pdecoByte(PDECO.free, p.t * 2 + p.o),
  lamp: () => pdecoByte(PDECO.lamp, 0),
  vent: (p) => pdecoByte(PDECO.vent, p.o),
  hatch: () => pdecoByte(PDECO.hatch, 0),
  exitdoor: (p) => pdecoByte(PDECO.exitdoor, p.o),
  panel: (p) => pdecoByte(PDECO.panel, p.o),
  lockeddoor: (p) => pdecoByte(PDECO.lockeddoor, p.o),
};

function pipesLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I, inside, walkEdge, pieceAt, count } = c;
  const { w, h } = t;
  // every doorway sits on a deck, one floor across
  for (const s of t.sockets) {
    if (new Set(s.prof).size > 1) E(`door at (${s.x},${s.y}) ${SIDE_CH[s.side]}: its lanes are at different heights`);
    if (s.z % BAND !== 0) E(`door at (${s.x},${s.y}) ${SIDE_CH[s.side]}: floor ${s.z} is not on a deck (0 or ±${BAND})`);
  }
  // drops: only catwalk over an engine-hall pit
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = I(x, y);
      if (t.cell[i] !== 1) continue;
      for (const s of [1, 2] as Side[]) {
        if (!walkEdge(x, y, s)) continue;
        const j = I(x + DX[s], y + DY[s]);
        if (t.cell[j] !== 1) continue;
        const drop = Math.abs(t.hgt[i] - t.hgt[j]);
        if (drop >= 2 && !(HALL_TYPES.has(PIPE_TYPES[t.zone[i]]) && HALL_TYPES.has(PIPE_TYPES[t.zone[j]]))) E(`(${x},${y})→(${x + DX[s]},${y + DY[s]}): a ${drop}-step drop outside a hall (only catwalk over an engine-hall pit may drop)`);
        if (drop >= 11) E(`(${x},${y}): a ${drop}-step drop would kill`);
      }
    }
  }
  // role rules
  if (def.role === "start" && count("hatch") !== 1) E("a start tile carries exactly one drain hatch '@'");
  if (def.role !== "start" && count("hatch")) E("only the start tile carries the drain hatch");
  if (def.role === "goal" && (count("exitdoor") !== 1 || count("panel") !== 1)) E("the goal tile carries exactly one pressure door 'E' and one fuse panel 'F'");
  if (def.role !== "goal" && (count("exitdoor") || count("panel"))) E("only the goal tile carries the pressure door and the fuse panel");
  if (def.role === "stair") {
    const zs = t.sockets.map((s) => s.z);
    if (t.sockets.length < 2 || Math.max(...zs) - Math.min(...zs) !== BAND) E(`a stair tile joins two decks: its doors must be ${BAND} steps apart`);
  }
  if (def.role === "gallery" || def.role === "hall" || def.role === "corridor") {
    if (t.sockets.length < 2) E(`a ${def.role} tile needs at least two doors — it is part of a route`);
  }
  const rooms = new Set(Array.from(t.room).filter((r) => r !== 255));
  for (const r of rooms) {
    let cells = 0;
    let lit = false;
    for (let i = 0; i < w * h; i++) {
      if (t.room[i] !== r) continue;
      cells++;
      if (pieceAt.get(i)?.k === "lamp") lit = true;
    }
    if (cells >= 6 && !lit) W(`room ${r + 1} (${t.roomKinds[r]}) has no lamp`);
  }
  void inside;
}

/** Pipe Dreams' dialect. */
export const PIPES_DIALECT: Dialect = {
  level: 2,
  types: PIPE_TYPES,
  zones: ZONES,
  glyphs: GLYPHS,
  groups: GLYPH_GROUPS,
  sets: TILE_SETS,
  roles: TILE_ROLES,
  blocks: { machine: MACHINES, tank: TANKS },
  solidLine: new Set(["rack"]),
  wallBacked: new Set(["wallA", "wallB", "vent", "exitdoor", "panel", "lockeddoor"]),
  needsRock: new Set(["exitdoor", "panel", "lockeddoor"]),
  riserBacked: new Set(["vent"]),
  doorwayOk: new Set(["lamp"]),
  axisKinds: new Set(["free", "rack"]),
  maxDoorWidth: 5,
  axisOf(k, c) {
    if (c.face === "H") return 0;
    if (c.face === "V") return 1;
    if (c.vert && !c.horiz) return 1;
    if (k === "free" && !c.horiz && (c.backed(1) || c.backed(3)) && !(c.backed(0) || c.backed(2))) return 1;
    return 0;
  },
  pieceByte: (p) => BYTE[p.k]?.(p) ?? 0,
  stairByte: (dir) => pdecoByte(PDECO.stairs, dir),
  step: (a, b) => Math.abs(a - b) <= 1,
  lint: pipesLint,
};

/** Parse a Pipe Dreams definition (see tiles.ts). */
export function parseTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, PIPES_DIALECT, lint);
}

/** Everything wrong with a Pipe Dreams tile. */
export function lintTile(def: TileDef): Lint & { tile: Tile } {
  return lintAny(def, PIPES_DIALECT);
}
