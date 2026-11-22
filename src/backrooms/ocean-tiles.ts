// LEVEL 7 — THALASSOPHOBIA — its DIALECT of the room library (tiles.ts is the
// format, shared by every level built from hand-drawn rooms).
//
// The city is drawn in 10-cell BLOCKS (ocean-vocab.ts). A block is mostly
// open water; the generator never builds a wall between two outdoor cells, so
// the blocks run together into one sea. A block belongs to THE CITY (set
// "city") or THE DROP (set "drop", the ring past the city's edge); the
// generator lays the Drop round the map's rim.
//
// FLOORS: the water types (seacanal, seaplaza, seadrop) take their zone's
// depth whatever the drawing says; the rest take their drawn height, and each
// type's height is checked against OCEAN_FLOOR_RANGE (a roof stands out of the
// water, a wading roof is under it by less than a swim, a sunk one by more).
// A solid cell ('#') is a building rising into the fog.
//
// What a block carries that PLAYS (the furniture layer):
//   D  THE HATCH — the way in from Lights Out (the start block only), on a
//      tower wall, two clear cells in front
//   U  THE SUBWAY STAIR — the way on to Level 8 (the goal block only), on a
//      wall at the bottom of the sunken plaza, a clear cell in front
//   K  a DIVING HELMET spot (dry floor; the plan picks one per map)
//   *  a caged bulkhead on the tower's ceiling (lit)

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type LintCtx, type Side, parseTile as parseAny, lintTile as lintAny, DX, DY } from "./tiles";
import { OCEAN_TYPES, MODULE, SLOT_W, TDECO, tdecoByte, OCEAN_DEPTH, OCEAN_FLOOR_RANGE, type OceanType } from "./ocean-vocab";

export type OceanSet = "city" | "drop";
/** start: the Tower · goal: the Sunken Plaza · block: an ordinary block. */
export type OceanRole = "start" | "goal" | "block";
export const OCEAN_SETS: readonly OceanSet[] = ["city", "drop"];
export const OCEAN_ROLES: readonly OceanRole[] = ["start", "goal", "block"];

/** Zone letters → room type. */
export const OCEAN_ZONES: Readonly<Record<string, OceanType>> = {
  t: "seatower",
  r: "searoof",
  w: "seawade",
  c: "seacanal",
  p: "seaplaza",
  d: "seadrop",
  s: "seasunk",
};

export const OCEAN_GLYPHS: Readonly<Record<string, Glyph>> = {
  D: { k: "entrance", t: 0, label: "the hatch (start block only)" },
  U: { k: "subway", t: 0, label: "the subway stair to Level 8 (goal block only)" },
  K: { k: "helmet", t: 0, label: "a Diving Helmet spot" },
  "*": { k: "lamp", t: 0, label: "a caged bulkhead (the tower's ceiling)" },
};

export const OCEAN_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Set pieces", glyphs: "DU" },
  { name: "Things to find", glyphs: "K" },
  { name: "Fixtures", glyphs: "*" },
];

const BYTE: Record<string, (p: { o: number }) => number> = {
  entrance: (p) => tdecoByte(TDECO.entrance, p.o),
  subway: (p) => tdecoByte(TDECO.subway, p.o),
  helmet: () => tdecoByte(TDECO.helmet, 0),
  lamp: () => tdecoByte(TDECO.lamp, 0),
};

/** The ROLE each set piece belongs to: exactly one in its own role's blocks,
 *  none anywhere else. */
const PIECE_ROLE: Record<string, OceanRole> = { entrance: "start", subway: "goal" };
/** Clear cells in front of each piece (0: only the cell it stands on). */
const FRONT: Record<string, number> = { entrance: 2, subway: 1, helmet: 0 };
const WALL_PIECES = new Set(["entrance", "subway"]);
/** The type each piece must stand on. */
const ON_TYPE: Record<string, readonly OceanType[]> = {
  entrance: ["seatower"],
  subway: ["seaplaza"],
  helmet: ["seatower", "searoof"],
  lamp: ["seatower"],
};

function oceanLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I } = c;
  const { w, h } = t;
  if (w % MODULE || h % MODULE) E(`a Thalassophobia block is drawn in ${MODULE}-cell modules: this one is ${w}×${h} (make it ${Math.max(MODULE, Math.round(w / MODULE) * MODULE)}×${Math.max(MODULE, Math.round(h / MODULE) * MODULE)})`);
  let holes = 0;
  for (let i = 0; i < w * h; i++) if (!t.cell[i]) holes++;
  if (holes) E(`${holes} cell${holes > 1 ? "s are" : " is"} not part of the block — a block fills its whole rectangle (use # for a building, c for water)`);
  const sets = Array.isArray(def.set) ? def.set : [def.set];
  if (sets.length !== 1 || !OCEAN_SETS.includes(sets[0] as OceanSet)) E(`a block is in the city ("city") or the Drop ("drop") — exactly one`);
  const drop = sets[0] === "drop";
  if (def.role !== "block" && drop) E("the tower and the plaza are in the city, not the Drop");
  // every cell's type, and its height against the type's range
  const types = t.dia.types as readonly string[];
  let water = 0;
  let towerCells = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = I(x, y);
      if (t.cell[i] !== 1) continue;
      const type = types[t.zone[i]] as OceanType;
      if (type === "seatower") towerCells++;
      if (OCEAN_DEPTH[type] !== undefined) {
        water++;
        if (drop && type !== "seadrop") E(`(${x},${y}): the Drop's water is the deep (d), not ${type}`);
        if (!drop && type === "seadrop") E(`(${x},${y}): the deep (d) is only past the city's edge — a Drop block`);
        continue;
      }
      const r = OCEAN_FLOOR_RANGE[type];
      if (r && (t.hgt[i] < r[0] || t.hgt[i] > r[1])) E(`(${x},${y}): a ${type} cell stands at ${t.hgt[i]} — it takes ${r[0]} to ${r[1]}`);
    }
  if (!water) W("no water at all in this block — the city is a sea; give it a street");
  if (def.role === "start" && !towerCells) E("the start block holds the tower (t)");
  if (def.role !== "start" && towerCells) E("only the start block holds the tower");
  // the streets' doorways: 2 wide, in the water
  for (const s of t.sockets) {
    if (s.w !== SLOT_W) E(`door at (${s.x},${s.y}): a street opening is ${SLOT_W} wide`);
    const ty = types[t.zone[I(s.x, s.y)]] as OceanType;
    if (OCEAN_DEPTH[ty] === undefined) E(`door at (${s.x},${s.y}): a block opens to its neighbours through the water (c or d), not ${ty}`);
  }
  // the set pieces: one each in its own role's blocks, none elsewhere, on
  // their own type, with clear floor in front
  const nameOf = (k: string): string => OCEAN_GLYPHS[Object.keys(OCEAN_GLYPHS).find((g) => OCEAN_GLYPHS[g].k === k)!].label;
  for (const [k, role] of Object.entries(PIECE_ROLE)) {
    const list = t.pieces.filter((p) => p.k === k);
    if (def.role === role && list.length !== 1) E(`a ${role} block carries exactly one: ${nameOf(k)}`);
    if (def.role !== role && list.length) E(`only a ${role} block carries ${nameOf(k)}`);
  }
  for (const p of t.pieces) {
    const k = p.k;
    const want = ON_TYPE[k];
    const at = types[t.zone[I(p.x, p.y)]] as OceanType;
    if (want && !want.includes(at)) E(`${nameOf(k)} at (${p.x},${p.y}): it stands on ${want.join(" or ")}, not ${at}`);
    if (FRONT[k] === undefined) continue;
    const back = p.o as Side;
    for (let q = 0; q <= FRONT[k]; q++) {
      const x = WALL_PIECES.has(k) ? p.x - DX[back] * q : p.x;
      const y = WALL_PIECES.has(k) ? p.y - DY[back] * q : p.y;
      const solidOrOut = x < 0 || y < 0 || x >= w || y >= h || t.cell[I(x, y)] !== 1;
      if (solidOrOut) E(`${nameOf(k)} at (${p.x},${p.y}): ${q ? `the ${q === 1 ? "cell" : "two cells"} in front of it must be` : "it must stand on"} clear floor`);
    }
  }
  if (towerCells && !t.pieces.some((p) => p.k === "lamp")) W("the tower has no fixtures on its ceiling (draw *)");
}

/** Thalassophobia's dialect. */
export const OCEAN_DIALECT: Dialect = {
  level: 7,
  types: OCEAN_TYPES,
  zones: OCEAN_ZONES,
  glyphs: OCEAN_GLYPHS,
  groups: OCEAN_GLYPH_GROUPS,
  sets: OCEAN_SETS,
  roles: OCEAN_ROLES,
  blocks: {},
  solidLine: new Set(),
  wallBacked: WALL_PIECES,
  needsRock: new Set(),
  riserBacked: new Set(),
  doorwayOk: new Set(["lamp"]),
  axisKinds: new Set(),
  maxDoorWidth: SLOT_W,
  axisOf: () => 0,
  pieceByte: (p) => BYTE[p.k]?.(p) ?? 0,
  stairByte: () => 0,
  // the water is one surface: a swimmer floats at the waterline, so a drawn
  // height says nothing about who can reach a cell. The generator's reach
  // check (on the sector's effective floor) is the one that holds the line.
  step: () => true,
  skipCell: () => false,
  lint: oceanLint,
};

/** Parse a Thalassophobia block (see tiles.ts). */
export function parseOceanTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, OCEAN_DIALECT, lint);
}

/** Everything wrong with a Thalassophobia block. */
export function lintOceanTile(def: TileDef): Lint & { tile: Tile } {
  return lintAny(def, OCEAN_DIALECT);
}
