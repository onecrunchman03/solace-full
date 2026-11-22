// THE ROOM LIBRARY's format — shared by every level built from hand-drawn
// rooms (Josh, 2026-09-27: "yeah lets go with your reccomendation" — hand-made
// rooms, arranged by the generator, the way DunGen builds Lethal Company's
// facility). Pipe Dreams was the first; the Poolrooms the second.
//
// A TILE is one hand-drawn piece of a level: a gallery run, a junction, a
// river bend, a locker room, a pool hall. It is drawn as text layers, one
// character per 2m cell, all the same size:
//
//   map     what each cell IS.  ' ' not part of the tile · '#' solid inside
//           it (a pillar, a plinth, a masonry wall) · '.' floor of the tile's
//           own type · a ZONE letter for floor of another type (each level's
//           dialect lists its own). A tile need not be a rectangle — spaces
//           are simply not part of it.
//   height  optional. The floor in STEPS (0.5m) above the tile's datum:
//           '0'-'9', 'A'-'C' for 10-12, 'a'-'l' for -1 to -12.
//   stair   optional. A stair cell and the way UP it: '^' '>' 'v' '<'.
//   rooms   optional. Label cells to split the tile into rooms: a wall is
//           built between two labels unless an `inner` door opens it.
//   walls   optional. THIN walls inside one room — a partition, a maze, a
//           cubicle row (Level 0 is drywall, not masonry): '-' a wall on the
//           cell's north edge, '|' on its west edge, '+' both. They turn and
//           mirror with the tile like everything else.
//   furn    optional. What stands on each cell — the level's own alphabet
//           (its dialect's GLYPHS). Wall pieces find the wall behind them; a
//           block piece (a machine, a pillar) is drawn as a block of its
//           letter exactly its footprint (two side by side need a gap).
//
//   props   optional. Real models from the prop kit (src/backrooms/kit.ts —
//           every prop Josh owns, named and filed): { p: id, v: variant,
//           x, y in CELLS from the tile's NW corner (3.5 = the middle of
//           cell 3), r: yaw in degrees clockwise from facing south, z:
//           metres off the floor }. They turn and mirror with the tile. A
//           solid one may never cut a room off from its doors. `c` is the
//           share of the room's copies it appears in (percent, default 100).
//   marks   optional. The GAME layer (marks.ts): creature spawners, relic
//           spots, lore-drive spots — points like props, turning with the
//           tile, copied into the map the generator builds.
//
// `doors` are the tile's SOCKETS: [x, y, side, width], the cell just inside
// the wall, the side it opens through, and how many cells wide — lanes run
// east from x for a N/S door and south from y for an E/W one. Two tiles join
// where a socket of one meets a socket of the other of the same width and the
// same floor PROFILE (the heights along its lanes — flat for a doorway, the
// river's cross-section for a river). `inner` doors are the same shape,
// between two rooms of one tile.
//
// WHAT DIFFERS BY LEVEL lives in a DIALECT (pipes-tiles.ts, pools-tiles.ts):
// the room types and zone letters, the furniture alphabet and how each piece
// turns, the deco byte it bakes to, the climb rule, and the level's own lint
// (Pipe Dreams' three decks, the Poolrooms' river profile). Everything here is
// the same for every level, so a new level is a dialect, a library and a
// generator — never another copy of this file.

import { type KitPlace, KIT, kitProblems, kitCovers, kitBlocks, kitExtents, kitYaw } from "./kit";
/** How far (cells, 4 cm) a solid prop may touch a doorway strip before it is
 *  standing in it — a prop flush with the jamb is not in the opening. */
const STRIP_SLACK = 0.02;
/** How deep (cells, 1 m) a doorway's strip reaches in from its edge. */
const STRIP_DEPTH = 0.5;
import { type LookSpec, lookProblems } from "./surfaces";
import { type MarkPlace, markProblems } from "./marks";
import { LID_NONE } from "./ceiling";
import { type StairSpec, stairProblems } from "./stairs";

export type Side = 0 | 1 | 2 | 3; // N E S W
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const SIDE_CH = "NESW";
export const opp = (s: Side): Side => ((s + 2) % 4) as Side;

/** [x, y, side letter, width] */
export type DoorSpec = [number, number, string, number];

export interface TileDef {
  id: string;
  /** Shown on the operator's map for a set piece ("Turbine Hall"); numbered
   *  when the level holds more than one. */
  name?: string;
  /** Room kind of the tile's main room (label of the first room). */
  kind: string;
  /** Which part of the level a tile belongs to (the dialect's SETS). */
  set: string | string[];
  /** What a tile does in the plan (the dialect's ROLES). */
  role: string;
  /** The tile's own zone ('.' cells) — one of the dialect's TYPES. */
  type: string;
  /** Walls / floor / ceiling this room wears instead of its level's own
   *  (on Level 0, its TYPE's), by surface id (surfaces.ts). Only the tile's
   *  own-type cells wear it; a corner painted another type keeps that type's
   *  look. Not in the map's fingerprint — a repaint never resets a level. */
  look?: LookSpec;
  /** How this room's STAIRS look (stairs.ts): their surface, colour, steps a
   *  cell, width and rails. Dressing — never in the fingerprint. */
  stairs?: StairSpec;
  /** Relative odds of being picked (default 1). */
  weight?: number;
  /** At most this many in a level. */
  max?: number;
  /** At least this many in a level. */
  min?: number;
  map: string[];
  height?: string[];
  /** THE HELD CEILING (ceiling.ts): per cell, "." (or nothing) = the ceiling
   *  follows the floor as it always has; a height glyph = the floor height
   *  the cell's ceiling hangs from, whatever its own floor is now. The
   *  Heights tool writes it when only the floor should move. */
  ceiling?: string[];
  stair?: string[];
  rooms?: string[];
  walls?: string[];
  furn?: string[];
  /** Room kinds of the other rooms, by their label. */
  roomKinds?: Record<string, string>;
  doors: DoorSpec[];
  inner?: DoorSpec[];
  /** Orientation overrides: [x, y, "N"|"E"|"S"|"W"|"H"|"V"]. */
  face?: [number, number, string][];
  /** Props from the kit, tile-local (see the header). */
  props?: KitPlace[];
  /** Game markers (marks.ts), tile-local like props. */
  marks?: MarkPlace[];
  note?: string;
}

export interface Glyph {
  /** The piece kind (the dialect's vocabulary). */
  k: string;
  /** A type index for most pieces; the footprint NAME for a block piece. */
  t: number | string;
  label: string;
}

export interface Footprint {
  name: string;
  w: number;
  h: number;
}

/** What a dialect's orientation rule sees of a cell's neighbourhood. */
export interface OrientCtx {
  /** The same letter east or west / north or south of it. */
  horiz: boolean;
  vert: boolean;
  /** How far the letter runs through the cell along x / along y. */
  runH: number;
  runV: number;
  /** An explicit override ("N" "E" "S" "W" "H" "V"), if one was drawn. */
  face?: string;
  /** Is there a wall behind side s (the default wall rule)? */
  backed: (s: Side) => boolean;
  /** Is the cell dx, dy away solid inside the tile? */
  solidAt: (dx: number, dy: number) => boolean;
  /** Floor of the open cell dx, dy away, or null (outside, or solid). */
  floorAt: (dx: number, dy: number) => number | null;
  /** Floor of this cell. */
  floor: number;
}

export interface Piece {
  k: string;
  /** Type index, or the index into the block's footprint table. */
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Side (0-3) for wall-backed pieces, axis (0 E-W, 1 N-S) for axis
   *  pieces, 0 otherwise. */
  o: number;
}

export interface Socket {
  /** The first lane (lanes run +x for N/S, +y for E/W). */
  x: number;
  y: number;
  side: Side;
  w: number;
  /** Floor of the first lane (steps above the datum). */
  z: number;
  /** Floor of every lane, in lane order: two sockets join only where these
   *  match. Flat for a doorway; a river's cross-section for a river. */
  prof: number[];
}

export interface Tile {
  def: TileDef;
  dia: Dialect;
  id: string;
  rot: number;
  mir: boolean;
  w: number;
  h: number;
  /** 0 not part of the tile · 1 open floor · 2 solid (pillar or fixture). */
  cell: Uint8Array;
  /** Index into the dialect's TYPES. */
  zone: Uint8Array;
  hgt: Int8Array;
  /** The held ceiling per cell, in floor steps (LID_NONE = follows the floor). */
  lid: Int8Array;
  /** SCENERY (Josh, Oct 2026: "i get the open cells cannot be walked to …
   *  even though i dont want them to be reachable"): 1 on an open cell no
   *  door of the room can walk to. It is DRAWN — a sunken pit, a room behind
   *  glass — and never entered: the generators make it a background cell
   *  (worldgen.ts `background`), which the server's step rule and the
   *  client's collision both treat as stone, so nobody can fall into it and
   *  be stranded, and nothing to hunt is ever placed there. Set by the lint. */
  scenery: Uint8Array;
  /** Ascent side of a stair cell, -1 elsewhere. */
  stair: Int8Array;
  /** Room index per cell (255 outside the tile). */
  room: Uint8Array;
  /** THIN walls: 1 on a cell's north / west edge (inside the tile only). */
  wallN: Uint8Array;
  wallW: Uint8Array;
  roomKinds: string[];
  pieces: Piece[];
  sockets: Socket[];
  /** Inner doors, one entry per lane. */
  inner: { x: number; y: number; side: Side }[];
  /** Cells OUTSIDE the tile that must stay rock (behind a door prop). */
  reserve: [number, number][];
  /** The baked deco byte per cell. */
  deco: Uint8Array;
  /** Kit props, tile-local, the usual fields filled in (v, r, z, c, text). */
  props: TileProp[];
  /** Each prop's index in the room's own list — a prop the checker skipped
   *  leaves a gap, and the editor's 3D pick must name the prop it drew (Oct
   *  2026 review: it moved the wrong one). */
  propSrc?: number[];
  /** Game markers, tile-local. */
  marks: MarkPlace[];
}

/** A prop in a parsed tile: the placement with its defaults filled in. */
export type TileProp = KitPlace & Required<Pick<KitPlace, "p" | "v" | "x" | "y" | "r" | "z" | "c" | "text">>;

export interface Lint {
  errors: string[];
  warnings: string[];
}

/** What a dialect's own lint is handed. */
export interface LintCtx {
  E: (m: string) => void;
  W: (m: string) => void;
  I: (x: number, y: number) => number;
  inside: (x: number, y: number) => boolean;
  /** Can a walker cross the edge on side s of (x, y) (no wall)? */
  walkEdge: (x: number, y: number, s: Side) => boolean;
  pieceAt: Map<number, Piece>;
  count: (k: string) => number;
}

/** Everything that makes one level's rooms different from another's. */
export interface Dialect {
  /** The level it belongs to (1 Poolrooms, 2 Pipe Dreams). */
  level: number;
  /** Room types, in zone-index order. */
  types: readonly string[];
  /** Zone letters → room type. */
  zones: Readonly<Record<string, string>>;
  /** The furniture alphabet. */
  glyphs: Readonly<Record<string, Glyph>>;
  /** The palette's grouping of it. */
  groups: readonly { name: string; glyphs: string }[];
  sets: readonly string[];
  roles: readonly string[];
  /** Kinds drawn as a block of letters, with their footprints. */
  blocks: Readonly<Record<string, readonly Footprint[]>>;
  /** Single-cell SOLID kinds with an axis (racks): placed before the wall
   *  pieces, which may hang on them. */
  solidLine: ReadonlySet<string>;
  /** Kinds that hang on a wall and take its side. */
  wallBacked: ReadonlySet<string>;
  /** Wall kinds that must stand on the tile's outside edge (rock behind). */
  needsRock: ReadonlySet<string>;
  /** Wall kinds that may hang on the face of a raised floor (a riser). */
  riserBacked: ReadonlySet<string>;
  /** Kinds a doorway may carry. */
  doorwayOk: ReadonlySet<string>;
  /** Kinds with an axis orientation (0 E-W, 1 N-S) that turns with the tile. */
  axisKinds: ReadonlySet<string>;
  /** Largest socket width. */
  maxDoorWidth: number;
  /** An axis piece's orientation as drawn. */
  axisOf(k: string, c: OrientCtx): number;
  /** A wall piece's backing rule, when it isn't the default (undefined). */
  backs?(k: string, c: OrientCtx, side: Side): boolean | undefined;
  /** The deco byte a piece bakes to (0 = none). */
  pieceByte(p: Piece): number;
  /** The deco byte of a stair cell. */
  stairByte(dir: number): number;
  /** Can a walker cross between neighbouring floors a and b (steps)? */
  step(a: number, b: number): boolean;
  /** Cells nobody is meant to stand in (Level 0's lethal shafts): left out
   *  of the "everything can be walked to" check. */
  skipCell?(h: number): boolean;
  /** The level's own rules. */
  lint(t: Tile, def: TileDef, c: LintCtx): void;
  /** A LATTICE level's slots (Nov 2026 polish round): its generator may open
   *  a doorway at ANY module-side slot whose two edge cells are floor (its
   *  cutDepth is 0 there), declared or not — so the checker keeps every such
   *  slot clear of solid props, not just the declared doors. */
  lattice?: {
    module: number;
    slotAt: number;
    slotW: number;
    /** Only rooms of these roles get a slot opened that they don't declare (unset: any role). */
    openRoles?: readonly string[];
    /** Rooms of these roles never do (the hotel's suites keep their one door). */
    closedRoles?: readonly string[];
    /** Pieces a generator still opens a slot over; any other piece on an edge cell keeps it shut (unset: any). */
    pieceOk?: readonly string[];
  };
}

// ---- Parsing ----------------------------------------------------------------------

/** Is there a THIN wall on side s of (x, y) inside the tile? */
export function thinWall(t: Tile, x: number, y: number, s: Side): boolean {
  if (s === 0) return !!t.wallN[y * t.w + x];
  if (s === 3) return !!t.wallW[y * t.w + x];
  if (s === 2) return y + 1 < t.h && !!t.wallN[(y + 1) * t.w + x];
  return x + 1 < t.w && !!t.wallW[y * t.w + x + 1];
}

const decodeH = (ch: string): number | null => {
  if (ch === "." || ch === " " || ch === undefined) return 0;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "A" && ch <= "C") return 10 + ch.charCodeAt(0) - 65;
  if (ch >= "a" && ch <= "l") return -(1 + ch.charCodeAt(0) - 97);
  return null;
};
export const encodeH = (h: number): string => {
  if (h >= 0 && h <= 9) return String(h);
  if (h >= 10 && h <= 12) return String.fromCharCode(65 + h - 10);
  if (h <= -1 && h >= -12) return String.fromCharCode(97 - h - 1);
  return "?";
};
const STAIR_CH = "^>v<";
const sideOf = (ch: string): Side | -1 => {
  const k = SIDE_CH.indexOf((ch ?? "").toUpperCase());
  return k < 0 ? -1 : (k as Side);
};

/** The floor under each lane of a socket, in lane order. */
function profileOf(t: Tile, s: { x: number; y: number; side: Side; w: number }): number[] {
  const lx = s.side === 0 || s.side === 2 ? 1 : 0;
  const out: number[] = [];
  for (let k = 0; k < s.w; k++) {
    const x = s.x + lx * k;
    const y = s.y + (1 - lx) * k;
    out.push(x >= 0 && y >= 0 && x < t.w && y < t.h ? t.hgt[y * t.w + x] : 0);
  }
  return out;
}

/** Parse a definition into its canonical (unrotated) tile, collecting every
 *  problem into `lint`. Always returns something drawable. */
export function parseTile(def: TileDef, dia: Dialect, lint: Lint = { errors: [], warnings: [] }): Tile {
  const E = (m: string): void => void lint.errors.push(m);
  const map = def.map ?? [];
  const h = map.length;
  const w = Math.max(0, ...map.map((r) => r.length));
  const n = w * h;
  const t: Tile = {
    def,
    dia,
    id: def.id,
    rot: 0,
    mir: false,
    w,
    h,
    cell: new Uint8Array(n),
    zone: new Uint8Array(n),
    hgt: new Int8Array(n),
    lid: new Int8Array(n).fill(LID_NONE),
    scenery: new Uint8Array(n),
    stair: new Int8Array(n).fill(-1),
    room: new Uint8Array(n).fill(255),
    wallN: new Uint8Array(n),
    wallW: new Uint8Array(n),
    roomKinds: [],
    pieces: [],
    sockets: [],
    inner: [],
    reserve: [],
    deco: new Uint8Array(n),
    props: [],
    marks: [],
  };
  if (!w || !h) {
    E("the map is empty");
    return t;
  }
  const at = (rows: string[] | undefined, x: number, y: number): string => (rows?.[y] ?? "")[x] ?? " ";
  for (const [name, rows] of [["height", def.height], ["ceiling", def.ceiling], ["stair", def.stair], ["rooms", def.rooms], ["walls", def.walls], ["furn", def.furn]] as [string, string[] | undefined][]) {
    if (!rows) continue;
    if (rows.length !== h) E(`the ${name} layer has ${rows.length} rows, the map ${h}`);
    rows.forEach((r, y) => r.length > w && E(`${name} row ${y} is wider than the map`));
  }
  const baseZone = dia.types.indexOf(def.type);
  if (baseZone < 0) E(`unknown type "${def.type}"`);
  const labels: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ch = at(map, x, y);
      if (ch === " ") continue;
      if (ch === "#") t.cell[i] = 2;
      else if (ch === ".") t.cell[i] = 1;
      else if (dia.zones[ch]) t.cell[i] = 1;
      else {
        E(`map (${x},${y}): unknown character "${ch}"`);
        t.cell[i] = 1;
      }
      t.zone[i] = dia.zones[ch] ? dia.types.indexOf(dia.zones[ch]) : Math.max(0, baseZone);
      const hv = decodeH(at(def.height, x, y));
      if (hv === null) E(`height (${x},${y}): unknown character "${at(def.height, x, y)}"`);
      t.hgt[i] = hv ?? 0;
      const lc = at(def.ceiling, x, y);
      if (lc !== " " && lc !== ".") {
        const lv = decodeH(lc);
        if (lv === null) E(`ceiling (${x},${y}): unknown character "${lc}"`);
        else t.lid[i] = lv;
      }
      const sc = at(def.stair, x, y);
      if (sc !== " " && sc !== ".") {
        const k = STAIR_CH.indexOf(sc);
        if (k < 0) E(`stair (${x},${y}): unknown character "${sc}"`);
        else t.stair[i] = k;
      }
      const lab = def.rooms ? at(def.rooms, x, y) : "1";
      const key = lab === " " || lab === "." ? "1" : lab;
      let r = labels.indexOf(key);
      if (r < 0) {
        r = labels.length;
        labels.push(key);
      }
      t.room[i] = r;
    }
  }
  t.roomKinds = labels.map((l) => def.roomKinds?.[l] ?? def.kind);
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && t.cell[y * w + x] !== 0;
  if (def.walls) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = at(def.walls, x, y);
        if (ch === " " || ch === ".") continue;
        if (ch !== "-" && ch !== "|" && ch !== "+") {
          E(`walls (${x},${y}): unknown character "${ch}" (use - for north, | for west, + for both)`);
          continue;
        }
        // only an edge BETWEEN two cells of the tile is a thin wall
        if ((ch === "-" || ch === "+") && inside(x, y) && inside(x, y - 1)) t.wallN[y * w + x] = 1;
        if ((ch === "|" || ch === "+") && inside(x, y) && inside(x - 1, y)) t.wallW[y * w + x] = 1;
      }
    }
  }

  // ---- sockets + inner doors
  const lanes = (d: DoorSpec): { cells: [number, number][]; side: Side } | null => {
    const side = sideOf(d[2]);
    const width = d[3] | 0;
    if (side < 0 || width < 1 || width > dia.maxDoorWidth) return null;
    const lx = side === 0 || side === 2 ? 1 : 0;
    return { cells: Array.from({ length: width }, (_, k) => [d[0] + lx * k, d[1] + (1 - lx) * k] as [number, number]), side: side as Side };
  };
  const socketEdge = new Set<string>();
  for (const d of def.doors ?? []) {
    const L = lanes(d);
    if (!L) {
      E(`door ${JSON.stringify(d)}: needs [x, y, "N|E|S|W", width 1-${dia.maxDoorWidth}]`);
      continue;
    }
    t.sockets.push({ x: L.cells[0][0], y: L.cells[0][1], side: L.side, w: L.cells.length, z: 0, prof: [] });
    for (const [x, y] of L.cells) socketEdge.add(`${x},${y},${L.side}`);
  }
  const innerEdge = new Set<string>();
  for (const d of def.inner ?? []) {
    const L = lanes(d);
    if (!L) {
      E(`inner door ${JSON.stringify(d)}: needs [x, y, "N|E|S|W", width 1-${dia.maxDoorWidth}]`);
      continue;
    }
    for (const [x, y] of L.cells) {
      t.inner.push({ x, y, side: L.side });
      innerEdge.add(`${x},${y},${L.side}`);
      innerEdge.add(`${x + DX[L.side]},${y + DY[L.side]},${opp(L.side)}`);
    }
  }

  // ---- the furniture: blocks first (the others read them as walls)
  const glyphAt = (x: number, y: number): string => (def.furn ? at(def.furn, x, y) : " ");
  const taken = new Uint8Array(n);
  const faceAt = new Map<string, string>((def.face ?? []).map((f) => [`${f[0]},${f[1]}`, String(f[2]).toUpperCase()]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ch = glyphAt(x, y);
      if (ch === " " || ch === "." || taken[i]) continue;
      const g = dia.glyphs[ch];
      if (!g) {
        E(`furn (${x},${y}): unknown character "${ch}"`);
        continue;
      }
      if (!inside(x, y)) {
        E(`furn (${x},${y}): "${ch}" stands outside the tile`);
        continue;
      }
      const table = dia.blocks[g.k];
      if (!table) continue;
      // flood the blob of this letter
      const blob: [number, number][] = [];
      const st: [number, number][] = [[x, y]];
      taken[i] = 1;
      while (st.length) {
        const [cx, cy] = st.pop()!;
        blob.push([cx, cy]);
        for (let s = 0; s < 4; s++) {
          const nx = cx + DX[s];
          const ny = cy + DY[s];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (taken[ni] || glyphAt(nx, ny) !== ch) continue;
          taken[ni] = 1;
          st.push([nx, ny]);
        }
      }
      const x0 = Math.min(...blob.map((b) => b[0]));
      const y0 = Math.min(...blob.map((b) => b[1]));
      const bw = Math.max(...blob.map((b) => b[0])) - x0 + 1;
      const bh = Math.max(...blob.map((b) => b[1])) - y0 + 1;
      const v = table.findIndex((m) => m.name === g.t && m.w === bw && m.h === bh);
      if (blob.length !== bw * bh || v < 0) {
        E(`furn (${x0},${y0}): the ${g.label.split(" ")[0]} block is ${bw}×${bh}${blob.length !== bw * bh ? " and not a rectangle" : ""} — it must be ${table.filter((m) => m.name === g.t).map((m) => `${m.w}×${m.h}`).join(" or ")} (two side by side need a gap)`);
        continue;
      }
      t.pieces.push({ k: g.k, t: v, x: x0, y: y0, w: bw, h: bh, o: 0 });
      for (const [cx, cy] of blob) if (t.cell[cy * w + cx] === 1) t.cell[cy * w + cx] = 2;
    }
  }
  const runOf = (x: number, y: number, dx: number, dy: number, ch: string): number => {
    let r = 1;
    for (let k = 1; glyphAt(x + dx * k, y + dy * k) === ch; k++) r++;
    for (let k = 1; glyphAt(x - dx * k, y - dy * k) === ch; k++) r++;
    return r;
  };
  // Is the edge on `side` of (x,y) a wall a piece can hang on?
  const backed = (x: number, y: number, side: Side, riser = false): boolean => {
    const nx = x + DX[side];
    const ny = y + DY[side];
    if (!inside(nx, ny)) return !socketEdge.has(`${x},${y},${side}`);
    const ni = ny * w + nx;
    if (t.cell[ni] === 2) return true;
    if (thinWall(t, x, y, side)) return true;
    if (t.room[ni] !== t.room[y * w + x]) return !innerEdge.has(`${x},${y},${side}`);
    // the face of a raised floor is a wall a vent can hang on
    return riser && t.hgt[ni] - t.hgt[y * w + x] >= 2;
  };
  const ctxAt = (x: number, y: number, ch: string, riser = false): OrientCtx => ({
    horiz: glyphAt(x - 1, y) === ch || glyphAt(x + 1, y) === ch,
    vert: glyphAt(x, y - 1) === ch || glyphAt(x, y + 1) === ch,
    runH: runOf(x, y, 1, 0, ch),
    runV: runOf(x, y, 0, 1, ch),
    face: faceAt.get(`${x},${y}`),
    backed: (s: Side) => backed(x, y, s, riser),
    solidAt: (dx: number, dy: number) => inside(x + dx, y + dy) && t.cell[(y + dy) * w + x + dx] === 2,
    floorAt: (dx: number, dy: number) => (inside(x + dx, y + dy) && t.cell[(y + dy) * w + x + dx] === 1 ? t.hgt[(y + dy) * w + x + dx] : null),
    floor: t.hgt[y * w + x],
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = glyphAt(x, y);
      const g = dia.glyphs[ch];
      if (!g || !dia.solidLine.has(g.k) || !inside(x, y)) continue;
      t.pieces.push({ k: g.k, t: typeof g.t === "number" ? g.t : 0, x, y, w: 1, h: 1, o: dia.axisOf(g.k, ctxAt(x, y, ch)) });
      if (t.cell[y * w + x] === 1) t.cell[y * w + x] = 2;
    }
  }
  const onPerimeter = (x: number, y: number, side: Side): boolean => !inside(x + DX[side], y + DY[side]) && !socketEdge.has(`${x},${y},${side}`);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = glyphAt(x, y);
      const g = dia.glyphs[ch];
      if (!g || dia.blocks[g.k] || dia.solidLine.has(g.k) || !inside(x, y)) continue;
      const i = y * w + x;
      if (t.cell[i] !== 1) {
        E(`furn (${x},${y}): "${ch}" stands on solid`);
        continue;
      }
      const f = faceAt.get(`${x},${y}`);
      const tt = typeof g.t === "number" ? g.t : 0;
      if (dia.wallBacked.has(g.k)) {
        const c = ctxAt(x, y, ch, dia.riserBacked.has(g.k));
        const need = dia.needsRock.has(g.k) ? (s: Side): boolean => onPerimeter(x, y, s) : (s: Side): boolean => dia.backs?.(g.k, c, s) ?? c.backed(s);
        let cands = ([0, 1, 2, 3] as Side[]).filter((s) => need(s));
        if (f && sideOf(f) >= 0) {
          if (!cands.includes(sideOf(f) as Side)) E(`furn (${x},${y}): the ${g.label} is turned ${f} but there is no wall there`);
          cands = [sideOf(f) as Side];
        }
        if (!cands.length) {
          E(`furn (${x},${y}): the ${g.label} has no ${dia.needsRock.has(g.k) ? "outside wall (it must stand on the tile's edge, not in a doorway)" : "wall behind it"}`);
          continue;
        }
        if (cands.length > 1) {
          const along = cands.filter((s) => (c.horiz && !c.vert ? s === 0 || s === 2 : c.vert && !c.horiz ? s === 1 || s === 3 : true));
          const facing = (along.length ? along : cands).filter((s) => {
            const ox = x - DX[s];
            const oy = y - DY[s];
            return inside(ox, oy) && t.cell[oy * w + ox] === 1;
          });
          cands = facing.length ? facing : along.length ? along : cands;
        }
        const side = cands[0];
        t.pieces.push({ k: g.k, t: tt, x, y, w: 1, h: 1, o: side });
        if (dia.needsRock.has(g.k)) for (let k = 1; k <= 2; k++) t.reserve.push([x + DX[side] * k, y + DY[side] * k]);
      } else if (dia.axisKinds.has(g.k)) {
        t.pieces.push({ k: g.k, t: tt, x, y, w: 1, h: 1, o: dia.axisOf(g.k, ctxAt(x, y, ch)) });
      } else {
        t.pieces.push({ k: g.k, t: tt, x, y, w: 1, h: 1, o: 0 });
      }
    }
  }
  // ---- the look
  for (const m of lookProblems(def.look)) E(m);
  for (const m of stairProblems(def.stairs)) E(m);
  // ---- the kit props
  t.propSrc = [];
  for (const [srcIdx, pl] of (def.props ?? []).entries()) {
    const tag = `prop "${pl.p}" at (${pl.x},${pl.y})`;
    const bad = kitProblems(pl);
    if (bad.length) {
      for (const m of bad) E(`${tag}: ${m}`);
      continue;
    }
    if (!inside(Math.floor(pl.x), Math.floor(pl.y))) {
      E(`${tag}: it stands outside the tile`);
      continue;
    }
    t.props.push({ ...pl, p: pl.p, v: pl.v ?? 1, x: pl.x, y: pl.y, r: kitYaw(pl.r ?? 0), z: pl.z ?? 0, c: pl.c ?? 100, text: pl.text ?? "" });
    t.propSrc.push(srcIdx);
  }
  // ---- the game markers
  for (const m of def.marks ?? []) {
    const tag = `marker "${m.k}" at (${m.x},${m.y})`;
    const bad = markProblems(m, dia.level);
    if (bad.length) {
      for (const q of bad) E(`${tag}: ${q}`);
      continue;
    }
    if (!inside(Math.floor(m.x), Math.floor(m.y)) || t.cell[Math.floor(m.y) * w + Math.floor(m.x)] !== 1) {
      E(`${tag}: it must stand on open floor`);
      continue;
    }
    t.marks.push({ ...m });
  }
  for (const s of t.sockets) {
    s.z = t.hgt[s.y * w + s.x];
    s.prof = profileOf(t, s);
  }
  bake(t);
  return t;
}

/** Write the deco bytes from the pieces and the stair layer. */
function bake(t: Tile): void {
  t.deco.fill(0);
  for (let i = 0; i < t.w * t.h; i++) if (t.stair[i] >= 0) t.deco[i] = t.dia.stairByte(t.stair[i]);
  for (const p of t.pieces) {
    const b = t.dia.pieceByte(p);
    if (b && p.x >= 0 && p.y >= 0 && p.x < t.w && p.y < t.h) t.deco[p.y * t.w + p.x] = b;
  }
}

// ---- Transforms -------------------------------------------------------------------

/** A copy of the tile mirrored (x flipped) and then turned `rot` quarter
 *  turns clockwise. */
export function transformTile(base: Tile, rot: number, mir: boolean): Tile {
  let t = base;
  if (mir) t = mirror(t);
  for (let k = 0; k < (rot & 3); k++) t = rotate(t);
  if (t === base) return base;
  t.rot = rot & 3;
  t.mir = mir;
  bake(t);
  return t;
}

function blank(src: Tile, w: number, h: number): Tile {
  const n = w * h;
  return {
    ...src,
    w,
    h,
    cell: new Uint8Array(n),
    zone: new Uint8Array(n),
    hgt: new Int8Array(n),
    lid: new Int8Array(n).fill(LID_NONE),
    scenery: new Uint8Array(n),
    stair: new Int8Array(n).fill(-1),
    room: new Uint8Array(n).fill(255),
    wallN: new Uint8Array(n),
    wallW: new Uint8Array(n),
    pieces: [],
    sockets: [],
    inner: [],
    reserve: [],
    deco: new Uint8Array(n),
    props: [],
    marks: [],
  };
}

function remap(src: Tile, out: Tile, f: (x: number, y: number) => [number, number], side: (s: Side) => Side, axis: (a: number) => number, yaw: (r: number) => number, flips = false): Tile {
  const dia = src.dia;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      const [nx, ny] = f(x, y);
      const j = ny * out.w + nx;
      out.cell[j] = src.cell[i];
      out.zone[j] = src.zone[i];
      out.hgt[j] = src.hgt[i];
      out.lid[j] = src.lid[i];
      out.scenery[j] = src.scenery[i];
      out.stair[j] = src.stair[i] < 0 ? -1 : side(src.stair[i] as Side);
      out.room[j] = src.room[i];
    }
  }
  // thin walls: map each edge to its new side, then store it on the cell that
  // owns that edge (a south edge is the north edge of the cell below)
  const putEdge = (x: number, y: number, sd: Side): void => {
    if (sd === 0) out.wallN[y * out.w + x] = 1;
    else if (sd === 3) out.wallW[y * out.w + x] = 1;
    else if (sd === 2 && y + 1 < out.h) out.wallN[(y + 1) * out.w + x] = 1;
    else if (sd === 1 && x + 1 < out.w) out.wallW[y * out.w + x + 1] = 1;
  };
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      const [nx, ny] = f(x, y);
      if (src.wallN[i]) putEdge(nx, ny, side(0));
      if (src.wallW[i]) putEdge(nx, ny, side(3));
    }
  }
  for (const p of src.pieces) {
    // map both corners of the footprint, take the new NW
    const [ax, ay] = f(p.x, p.y);
    const [bx, by] = f(p.x + p.w - 1, p.y + p.h - 1);
    const x = Math.min(ax, bx);
    const y = Math.min(ay, by);
    const w = Math.abs(bx - ax) + 1;
    const h = Math.abs(by - ay) + 1;
    let tt = p.t;
    const table = dia.blocks[p.k];
    if (table) tt = table.findIndex((m) => m.name === table[p.t].name && m.w === w && m.h === h);
    const o = dia.wallBacked.has(p.k) ? side(p.o as Side) : dia.axisKinds.has(p.k) ? axis(p.o) : 0;
    out.pieces.push({ ...p, x, y, w, h, t: tt, o });
  }
  for (const s of src.sockets) {
    const lx = s.side === 0 || s.side === 2 ? 1 : 0;
    const cells = Array.from({ length: s.w }, (_, k) => f(s.x + lx * k, s.y + (1 - lx) * k));
    const ns = { x: Math.min(...cells.map((c) => c[0])), y: Math.min(...cells.map((c) => c[1])), side: side(s.side), w: s.w, z: s.z, prof: [] as number[] };
    ns.prof = profileOf(out, ns);
    out.sockets.push(ns);
  }
  for (const d of src.inner) {
    const [x, y] = f(d.x, d.y);
    out.inner.push({ x, y, side: side(d.side) });
  }
  out.reserve = src.reserve.map(([x, y]) => f(x, y));
  // props are CONTINUOUS points: f maps cells, so map the point as if it were
  // a cell's corner offset by half a cell (f is affine, so this is exact)
  for (const pl of src.props) {
    const [x, y] = f(pl.x - 0.5, pl.y - 0.5);
    // a mirror swaps the prop's left for its right: its roll changes sign
    const q = { ...pl, x: x + 0.5, y: y + 0.5, r: kitYaw(yaw(pl.r)) };
    if (flips && q.rz) q.rz = -q.rz;
    out.props.push(q);
  }
  for (const m of src.marks) {
    const [x, y] = f(m.x - 0.5, m.y - 0.5);
    out.marks.push({ ...m, x: x + 0.5, y: y + 0.5 });
  }
  return out;
}

function mirror(t: Tile): Tile {
  // a mirror flips east for west: a prop facing west now faces east
  return remap(t, blank(t, t.w, t.h), (x, y) => [t.w - 1 - x, y], (s) => (s === 1 ? 3 : s === 3 ? 1 : s), (a) => a, (r) => -r, true);
}
function rotate(t: Tile): Tile {
  // a clockwise quarter turn: a prop facing south now faces west
  return remap(t, blank(t, t.h, t.w), (x, y) => [t.h - 1 - y, x], (s) => ((s + 1) % 4) as Side, (a) => 1 - a, (r) => r + 90);
}

/** Every distinct placement of a tile: four turns, mirrored or not. */
/** Every distinct placement of a room: four turns, mirrored or not. Two
 *  placements are the SAME ROOM when their shape is — floor, heights,
 *  furniture, walls and doors; props and markers are dressing and never
 *  count, or one off-centre prop in a symmetric room would change how many
 *  placements it has, and with it every draw the generator makes after (a
 *  props-only publish rebuilding the map). */
export function tileVariants(base: Tile): Tile[] {
  const out: Tile[] = [];
  const seen = new Set<string>();
  for (const mir of [false, true]) {
    for (let r = 0; r < 4; r++) {
      const v = transformTile(base, r, mir);
      const key = `${v.w}x${v.h}:${Array.from(v.cell).join("")}:${Array.from(v.deco).join(",")}:${Array.from(v.hgt).join(",")}:${Array.from(v.wallN).join("")}${Array.from(v.wallW).join("")}:${v.sockets.map((s) => `${s.x},${s.y},${s.side},${s.w}`).join(";")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

// ---- Lint ---------------------------------------------------------------------------

/** Everything wrong with a tile, in words the editor can show beside it. */
export function lintTile(def: TileDef, dia: Dialect): Lint & { tile: Tile } {
  const lint: Lint = { errors: [], warnings: [] };
  const E = (m: string): void => void lint.errors.push(m);
  const Wn = (m: string): void => void lint.warnings.push(m);
  if (!def.id || !/^[a-z0-9-]+$/.test(def.id)) E("the id must be lowercase letters, digits and dashes");
  const t = parseTile(def, dia, lint);
  const { w, h } = t;
  if (!w || !h) return { ...lint, tile: t };
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && t.cell[y * w + x] !== 0;
  const I = (x: number, y: number): number => y * w + x;
  const pieceAt = new Map<number, Piece>();
  for (const p of t.pieces) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) pieceAt.set(I(x, y), p);
  const isSolidPiece = (k: string): boolean => !!dia.blocks[k] || dia.solidLine.has(k);

  // sockets
  if (!t.sockets.length) E("the tile has no doors — nothing can reach it");
  for (const s of t.sockets) {
    const lx = s.side === 0 || s.side === 2 ? 1 : 0;
    for (let k = 0; k < s.w; k++) {
      const x = s.x + lx * k;
      const y = s.y + (1 - lx) * k;
      const tag = `door at (${x},${y}) ${SIDE_CH[s.side]}`;
      if (!inside(x, y) || t.cell[I(x, y)] !== 1) {
        E(`${tag}: its cell is not open floor`);
        continue;
      }
      if (inside(x + DX[s.side], y + DY[s.side])) E(`${tag}: it opens into the tile itself — a door must be on the tile's edge`);
      for (const [cx, cy] of [[x, y], [x - DX[s.side], y - DY[s.side]]] as [number, number][]) {
        // a one-cell-deep tile (a tunnel's side door) has no step inside
        if (!inside(cx, cy) && (cx !== x || cy !== y)) continue;
        if (!inside(cx, cy) || t.cell[I(cx, cy)] !== 1) E(`${tag}: the step inside it is blocked`);
        else {
          const p = pieceAt.get(I(cx, cy));
          if (p && !dia.doorwayOk.has(p.k)) E(`${tag}: a ${p.k} stands in the doorway`);
          if (t.stair[I(cx, cy)] >= 0) E(`${tag}: a doorway cannot open onto a stair`);
        }
      }
    }
  }
  // inner doors
  const innerEdge = new Set<string>();
  for (const d of t.inner) {
    const nx = d.x + DX[d.side];
    const ny = d.y + DY[d.side];
    const tag = `inner door at (${d.x},${d.y}) ${SIDE_CH[d.side]}`;
    innerEdge.add(`${d.x},${d.y},${d.side}`);
    innerEdge.add(`${nx},${ny},${opp(d.side)}`);
    if (!inside(d.x, d.y) || !inside(nx, ny) || t.cell[I(d.x, d.y)] !== 1 || t.cell[I(nx, ny)] !== 1) {
      E(`${tag}: both sides must be open floor`);
      continue;
    }
    if (t.room[I(d.x, d.y)] === t.room[I(nx, ny)]) Wn(`${tag}: both sides are the same room (no wall to open)`);
    if (!dia.step(t.hgt[I(d.x, d.y)], t.hgt[I(nx, ny)])) E(`${tag}: the floors either side differ by more than a step`);
    for (const [cx, cy] of [[d.x, d.y], [nx, ny]] as [number, number][]) {
      const p = pieceAt.get(I(cx, cy));
      if (p && !dia.doorwayOk.has(p.k)) E(`${tag}: a ${p.k} stands in the doorway`);
      if (t.stair[I(cx, cy)] >= 0) E(`${tag}: a doorway cannot open onto a stair`);
    }
    // and the step behind the doorway, on each side
    for (const [cx, cy] of [[d.x - DX[d.side], d.y - DY[d.side]], [nx + DX[d.side], ny + DY[d.side]]] as [number, number][]) {
      if (!inside(cx, cy)) continue;
      const p = pieceAt.get(I(cx, cy));
      if (p && !dia.doorwayOk.has(p.k)) E(`${tag}: a ${p.k} at (${cx},${cy}) blocks the step through the doorway`);
    }
  }
  // overlaps: a fixture on a stair, two things on one cell
  const counts = new Map<number, number>();
  for (const p of t.pieces) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) counts.set(I(x, y), (counts.get(I(x, y)) ?? 0) + 1);
  for (const [i, c] of counts) {
    if (c > 1) E(`(${i % w},${(i / w) | 0}): two things on one cell`);
    if (t.stair[i] >= 0) E(`(${i % w},${(i / w) | 0}): furniture on a stair`);
  }
  // fixtures stand level
  for (const p of t.pieces) {
    if (!isSolidPiece(p.k)) continue;
    const z = t.hgt[I(p.x, p.y)];
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (t.hgt[I(x, y)] !== z) E(`(${p.x},${p.y}): the ${p.k} stands across two floor heights`);
  }
  // Is an edge open to walk through (no wall)?
  const walkEdge = (x: number, y: number, s: Side): boolean => {
    const nx = x + DX[s];
    const ny = y + DY[s];
    if (!inside(nx, ny)) return false;
    if (t.room[I(x, y)] !== t.room[I(nx, ny)]) return innerEdge.has(`${x},${y},${s}`);
    return !thinWall(t, x, y, s);
  };
  // the level's own rules: sockets, drops, roles
  const count = (k: string): number => t.pieces.filter((p) => p.k === k).length;
  dia.lint(t, def, { E, W: Wn, I, inside, walkEdge, pieceAt, count });
  // stairs climb
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = I(x, y);
      if (t.cell[i] !== 1 || t.stair[i] < 0) continue;
      const s = t.stair[i] as Side;
      const ux = x + DX[s];
      const uy = y + DY[s];
      const dx = x - DX[s];
      const dy = y - DY[s];
      const up = inside(ux, uy) ? t.hgt[I(ux, uy)] - t.hgt[i] : 0;
      const down = inside(dx, dy) ? t.hgt[i] - t.hgt[I(dx, dy)] : 0;
      if (up < 0 || down < 0 || (up === 0 && down === 0)) Wn(`stair (${x},${y}): it does not climb ${SIDE_CH[s]}`);
    }
  }
  // one piece: everything reachable from the doors, by the climb rule
  const open: number[] = [];
  for (let i = 0; i < w * h; i++) if (t.cell[i] === 1 && !dia.skipCell?.(t.hgt[i])) open.push(i);
  if (open.length && t.sockets.length) {
    // flood from ONE door: seeded from all of them, two halves that each
    // hold a door would both read as reachable (the Level 0 audit's fault)
    const seen = new Uint8Array(w * h);
    const st: number[] = [];
    for (const s of t.sockets) {
      const i = I(s.x, s.y);
      if (t.cell[i] === 1) {
        seen[i] = 1;
        st.push(i);
        break;
      }
    }
    while (st.length) {
      const c = st.pop()!;
      const cx = c % w;
      const cy = (c / w) | 0;
      for (let s = 0; s < 4; s++) {
        if (!walkEdge(cx, cy, s as Side)) continue;
        const j = I(cx + DX[s], cy + DY[s]);
        if (seen[j] || t.cell[j] !== 1 || dia.skipCell?.(t.hgt[j]) || !dia.step(t.hgt[j], t.hgt[c])) continue;
        seen[j] = 1;
        st.push(j);
      }
    }
    // floor no door reaches is SCENERY, not a mistake to stop on: a warning,
    // and the generators draw it and keep everyone out of it (see Tile.scenery)
    const cut = open.filter((i) => !seen[i]);
    for (const i of cut) t.scenery[i] = 1;
    if (cut.length) Wn(`${cut.length} open cell${cut.length > 1 ? "s" : ""} can't be walked to from a door, so ${cut.length > 1 ? "they'll be" : "it'll be"} scenery — drawn, never entered (first at (${cut[0] % w},${(cut[0] / w) | 0})). Fine if that's on purpose.`);
    const unjoined = t.sockets.filter((s) => !seen[I(s.x, s.y)]);
    if (unjoined.length) E(`door at (${unjoined[0].x},${unjoined[0].y}) cannot be walked to from the other doors`);
  }
  // kit props: a solid one blocks every cell whose middle it covers. It may
  // not stand in a doorway, and the room must stay one piece without that
  // cell — a crate can make a room awkward, never make it a dead end.
  if (t.props.length && !lint.errors.length) {
    const blockedBy = new Map<number, string>();
    for (const pl of t.props) {
      if (!kitBlocks(pl)) continue;
      const name = `the ${KIT.get(pl.p)!.name.toLowerCase()} at (${pl.x},${pl.y})`;
      for (let i = 0; i < w * h; i++) if (t.cell[i] === 1 && kitCovers(pl, (i % w) + 0.5, ((i / w) | 0) + 0.5)) blockedBy.set(i, name);
    }
    // THE DOORWAY STRIP (Nov 2026 polish round): a solid prop may not reach
    // into a doorway's cells at all. Testing only the cells whose MIDDLE it
    // covers let a sofa centred on the line between the two door cells, or a
    // shelf hugging the wall inside one, stand in the opening untouched.
    const strips: { x: number; y: number; side: Side; slot: boolean }[] = t.sockets.map((s) => ({ x: s.x, y: s.y, side: s.side, slot: false }));
    const L = dia.lattice;
    const opens = !!L && (!L.openRoles || L.openRoles.includes(def.role)) && !L.closedRoles?.includes(def.role);
    if (L && opens) {
      // …and on a lattice level, every module-side slot the generator may
      // open: both edge cells floor (its cutDepth is 0 there)
      const { module: M, slotAt, slotW } = L;
      const declared = new Set(t.sockets.map((s) => `${s.x},${s.y},${s.side}`));
      for (const side of [0, 1, 2, 3] as Side[]) {
        const along = side === 0 || side === 2 ? w : h;
        for (let m = 0; m * M < along; m++) {
          const a = m * M + slotAt;
          const x = side === 1 ? w - 1 : side === 3 ? 0 : a;
          const y = side === 2 ? h - 1 : side === 0 ? 0 : a;
          if (declared.has(`${x},${y},${side}`)) continue;
          let floor = true;
          for (let k = 0; k < slotW; k++) {
            const cx = side === 0 || side === 2 ? x + k : x;
            const cy = side === 1 || side === 3 ? y + k : y;
            if (!inside(cx, cy) || t.cell[I(cx, cy)] !== 1) floor = false;
            const p = pieceAt.get(I(cx, cy));
            if (p && L.pieceOk && !L.pieceOk.includes(p.k)) floor = false;
          }
          if (floor) strips.push({ x, y, side, slot: true });
        }
      }
    }
    const slotW = dia.lattice?.slotW ?? 0;
    for (const s of strips) {
      const sock = t.sockets.find((q) => q.x === s.x && q.y === s.y && q.side === s.side);
      const n = s.slot ? slotW : sock?.w ?? 1;
      const lx = s.side === 0 || s.side === 2 ? 1 : 0;
      // the strip: the opening along the edge, STRIP_DEPTH in from it (a
      // panel on a corridor's side wall a metre and more back is not in it)
      const d = STRIP_DEPTH;
      const x0 = lx ? s.x : s.side === 1 ? s.x + 1 - d : s.x;
      const x1 = lx ? s.x + n : s.side === 1 ? s.x + 1 : s.x + d;
      const y0 = lx ? (s.side === 2 ? s.y + 1 - d : s.y) : s.y;
      const y1 = lx ? (s.side === 2 ? s.y + 1 : s.y + d) : s.y + n;
      for (const pl of t.props) {
        if (!kitBlocks(pl)) continue;
        const e = kitExtents(pl);
        const ox = Math.min(pl.x + e.rx, x1) - Math.max(pl.x - e.rx, x0);
        const oy = Math.min(pl.y + e.ry, y1) - Math.max(pl.y - e.ry, y0);
        if (ox > STRIP_SLACK && oy > STRIP_SLACK) {
          const name = `the ${KIT.get(pl.p)!.name.toLowerCase()} at (${pl.x},${pl.y})`;
          E(s.slot ? `${name} stands in the slot at (${s.x},${s.y}) ${SIDE_CH[s.side]} — the generator may open a doorway there, so keep it clear` : `${name} blocks the door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`);
        }
      }
    }
    for (const d of t.inner) {
      const i = I(d.x, d.y);
      const j = I(d.x + DX[d.side], d.y + DY[d.side]);
      for (const c of [i, j]) if (blockedBy.has(c)) E(`${blockedBy.get(c)} blocks the inner door at (${d.x},${d.y})`);
    }
    if (blockedBy.size) {
      const seen = new Uint8Array(w * h);
      const st: number[] = [];
      for (const s of t.sockets) {
        const i = I(s.x, s.y);
        if (!blockedBy.has(i)) {
          seen[i] = 1;
          st.push(i);
          break;
        }
      }
      while (st.length) {
        const c = st.pop()!;
        for (let s = 0; s < 4; s++) {
          if (!walkEdge(c % w, (c / w) | 0, s as Side)) continue;
          const j = I((c % w) + DX[s], ((c / w) | 0) + DY[s]);
          if (seen[j] || t.cell[j] !== 1 || blockedBy.has(j) || !dia.step(t.hgt[j], t.hgt[c])) continue;
          seen[j] = 1;
          st.push(j);
        }
      }
      const cut = open.filter((i) => !seen[i] && !blockedBy.has(i) && !t.scenery[i]);
      if (cut.length) {
        const culprits = [...new Set(blockedBy.values())];
        E(`${culprits.length === 1 ? culprits[0] : "the props"} cut${culprits.length === 1 ? "s" : ""} off ${cut.length} cell${cut.length > 1 ? "s" : ""} (first at (${cut[0] % w},${(cut[0] / w) | 0}))`);
      }
      const unjoined = t.sockets.filter((s) => !seen[I(s.x, s.y)] && !blockedBy.has(I(s.x, s.y)));
      if (unjoined.length) E(`the props cut the door at (${unjoined[0].x},${unjoined[0].y}) off from the others`);
    }
  }
  if (!dia.roles.includes(def.role)) E(`unknown role "${def.role}"`);
  for (const s of Array.isArray(def.set) ? def.set : [def.set]) if (!dia.sets.includes(s)) E(`unknown set "${s}"`);
  return { ...lint, tile: t };
}

// ---- The file ----------------------------------------------------------------------

const KEY_ORDER: readonly (keyof TileDef)[] = ["id", "name", "kind", "set", "role", "type", "look", "stairs", "weight", "min", "max", "note", "map", "height", "ceiling", "stair", "rooms", "walls", "furn", "roomKinds", "inner", "face", "doors", "props", "marks"];
const GRID_KEYS: ReadonlySet<string> = new Set(["map", "height", "ceiling", "stair", "rooms", "walls", "furn"]);

/** The library file, written the one way: a key per line, a grid row per
 *  line, so a diff of an edited room reads as the rows that changed. The
 *  room editor saves through this. */
export function formatLibrary(tiles: readonly TileDef[]): string {
  const lines = ["{", '  "version": 1,', '  "tiles": ['];
  tiles.forEach((t, k) => {
    const rec = t as unknown as Record<string, unknown>;
    const keys = KEY_ORDER.filter((key) => rec[key] !== undefined && rec[key] !== null && !(Array.isArray(rec[key]) && !(rec[key] as unknown[]).length && key !== "doors"));
    lines.push("    {");
    keys.forEach((key, j) => {
      const v = rec[key];
      const comma = j < keys.length - 1 ? "," : "";
      if (key === "props" && Array.isArray(v)) {
        // one prop per line, fields in one order, defaults left out — so a
        // moved crate is a one-line diff
        lines.push(`      "props": [`);
        v.forEach((pl: KitPlace, q) => {
          const o: Record<string, unknown> = { p: pl.p };
          if ((pl.v ?? 1) !== 1) o.v = pl.v;
          o.x = pl.x;
          o.y = pl.y;
          if (pl.r) o.r = pl.r;
          if (pl.z) o.z = pl.z;
          if (pl.c !== undefined && pl.c !== 100) o.c = pl.c;
          if (pl.text) o.text = pl.text;
          if (pl.rx) o.rx = pl.rx;
          if (pl.rz) o.rz = pl.rz;
          for (const k of ["sx", "sy", "sz", "tex", "col"] as const) if (pl[k] !== undefined) o[k] = pl[k];
          if (pl.solid === false) o.solid = false;
          lines.push(`        ${JSON.stringify(o)}${q < v.length - 1 ? "," : ""}`);
        });
        lines.push(`      ]${comma}`);
      } else if (key === "marks" && Array.isArray(v)) {
        // one marker per line, like props
        lines.push(`      "marks": [`);
        v.forEach((m: MarkPlace, q) => lines.push(`        ${JSON.stringify(m)}${q < v.length - 1 ? "," : ""}`));
        lines.push(`      ]${comma}`);
      } else if (GRID_KEYS.has(key) && Array.isArray(v)) {
        lines.push(`      ${JSON.stringify(key)}: [`);
        v.forEach((r, q) => lines.push(`        ${JSON.stringify(r)}${q < v.length - 1 ? "," : ""}`));
        lines.push(`      ]${comma}`);
      } else lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(v)}${comma}`);
    });
    lines.push(`    }${k < tiles.length - 1 ? "," : ""}`);
  });
  lines.push("  ]", "}", "");
  return lines.join("\n");
}
