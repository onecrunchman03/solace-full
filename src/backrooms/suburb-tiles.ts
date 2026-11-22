// LEVEL 9 — THE SUBURBS — its DIALECT of the room library (tiles.ts is the
// format, shared by every level built from hand-drawn rooms).
//
// The Suburbs are Lights Out's LATTICE (suburb-vocab.ts): every room is a
// whole number of 8-cell modules, filled edge to edge, with a 2-wide doorway
// SLOT in the middle of every module side it may open through. A room is a
// piece of STREET (set "street": the manhole's cul-de-sac and the road pieces
// the grid lays) or a LOT (set "lot": houses, garages, yards, the park, and
// Number 9).
//
// THE STREET PIECES: a road with a sidewalk either side. Where the road runs
// out of a side, the two slot cells of that side are road; where it doesn't,
// they're sidewalk (a lot's front path meets it there). The grid picks a piece
// by the sides its road runs out of, so a straight, a tee and a crossing are
// all it needs.
//
// HOUSES are drawn with THIN walls (the walls layer) inside the lot's one
// room: the shell, a front door and a back door left open in it, partitions
// within. Indoor floor is house (h) or garage (g); everything else is yard.
//
// What a room carries that PLAYS (the furniture layer — everything else is
// dressing, drawn with kit props in the props layer):
//   D  THE MANHOLE — the way in (the start room only), against the rim wall,
//      two clear cells in front
//   F  THE FRONT DOOR of Number 9 (the goal room only), on the house's wall,
//      a clear cell in front
//   K  a HOUSE KEY spot (indoors only; the plan picks one per map)
//   *  a streetlight, lit (a pool the Watch won't enter)
//   =  a streetlight, dead
//   ~  a streetlight, flickering (no light at all, to the Watch)
//   P  a porch light, lit (Number 9's)
//   p  a porch light, dead (an ordinary house's: it marks the house's FRONT)

import { type Dialect, type Glyph, type Tile, type TileDef, type Lint, type LintCtx, type Side, parseTile as parseAny, lintTile as lintAny, DX, DY, SIDE_CH } from "./tiles";
import { SUBURB_TYPES, MODULE, SLOT_AT, SLOT_W, UDECO, udecoByte, SUBURB_INDOOR_TYPES, STREET_TYPES, type SuburbType } from "./suburb-vocab";

export type SuburbSet = "street" | "lot";
/** start: the Manhole · goal: Number 9 · block: an ordinary piece. */
export type SuburbRole = "start" | "goal" | "block";
export const SUBURB_SETS: readonly SuburbSet[] = ["street", "lot"];
export const SUBURB_ROLES: readonly SuburbRole[] = ["start", "goal", "block"];

/** Which set each room type belongs in. */
export const SUBURB_TYPE_SETS: Readonly<Record<SuburbType, readonly SuburbSet[]>> = {
  manhole: ["street"],
  road: ["street"],
  sidewalk: ["street", "lot"],
  yard: ["lot"],
  house: ["lot"],
  garage: ["lot"],
  park: ["lot"],
  porch: ["lot"],
};

/** Zone letters → room type. */
export const SUBURB_ZONES: Readonly<Record<string, SuburbType>> = {
  m: "manhole",
  r: "road",
  w: "sidewalk",
  y: "yard",
  h: "house",
  g: "garage",
  k: "park",
  q: "porch",
};

export const SUBURB_GLYPHS: Readonly<Record<string, Glyph>> = {
  D: { k: "entrance", t: 0, label: "the manhole (start room only)" },
  F: { k: "frontdoor", t: 0, label: "the front door of Number 9 (goal room only)" },
  K: { k: "key", t: 0, label: "a House Key spot (indoors)" },
  "*": { k: "lamp", t: 0, label: "a streetlight (lit)" },
  "=": { k: "dead", t: 0, label: "a streetlight (dead)" },
  "~": { k: "flicker", t: 0, label: "a streetlight (flickering)" },
  P: { k: "porch", t: 0, label: "a porch light (lit — Number 9's)" },
  p: { k: "porchdead", t: 0, label: "a porch light (dead — marks a house's front)" },
};

export const SUBURB_GLYPH_GROUPS: readonly { name: string; glyphs: string }[] = [
  { name: "Set pieces", glyphs: "DF" },
  { name: "Things to find", glyphs: "K" },
  { name: "Lights", glyphs: "*=~Pp" },
];

/** Lamp variants on the wire (UDECO.lamp). */
export const LAMP_LIT = 0;
export const LAMP_DEAD = 1;
export const LAMP_FLICKER = 2;
export const LAMP_PORCH = 3;
export const LAMP_PORCH_DEAD = 4;

const BYTE: Record<string, (p: { o: number }) => number> = {
  entrance: (p) => udecoByte(UDECO.entrance, p.o),
  frontdoor: (p) => udecoByte(UDECO.frontdoor, p.o),
  key: () => udecoByte(UDECO.key, 0),
  lamp: () => udecoByte(UDECO.lamp, LAMP_LIT),
  dead: () => udecoByte(UDECO.lamp, LAMP_DEAD),
  flicker: () => udecoByte(UDECO.lamp, LAMP_FLICKER),
  porch: () => udecoByte(UDECO.lamp, LAMP_PORCH),
  porchdead: () => udecoByte(UDECO.lamp, LAMP_PORCH_DEAD),
};

/** Where the slots start along a room side of `len` cells. */
export function suburbSlotStart(len: number): number[] {
  const out: number[] = [];
  for (let m = 0; m * MODULE < len; m++) out.push(m * MODULE + SLOT_AT);
  return out;
}

const PIECE_ROLE: Record<string, SuburbRole> = { entrance: "start", frontdoor: "goal" };
/** Clear cells in front of each piece (0: only the cell it stands on). */
const FRONT: Record<string, number> = { entrance: 2, frontdoor: 1, key: 0 };
const WALL_PIECES = new Set(["entrance", "frontdoor"]);
const LIGHTS = new Set(["lamp", "dead", "flicker", "porch", "porchdead"]);

function suburbLint(t: Tile, def: TileDef, c: LintCtx): void {
  const { E, W, I } = c;
  const { w, h } = t;
  if (w % MODULE || h % MODULE) E(`a Suburbs room is drawn in ${MODULE}-cell modules: this one is ${w}×${h} (make it ${Math.max(MODULE, Math.round(w / MODULE) * MODULE)}×${Math.max(MODULE, Math.round(h / MODULE) * MODULE)})`);
  let holes = 0;
  for (let i = 0; i < w * h; i++) if (!t.cell[i]) holes++;
  if (holes) E(`${holes} cell${holes > 1 ? "s are" : " is"} not part of the room — a Suburbs room fills its whole rectangle (use # for a solid wall or hedge)`);
  const sets = Array.isArray(def.set) ? def.set : [def.set];
  if (sets.length !== 1 || !SUBURB_SETS.includes(sets[0] as SuburbSet)) E(`a Suburbs room is a piece of street ("street") or a lot ("lot") — exactly one`);
  const set = sets[0] as SuburbSet;
  const type = def.type as SuburbType;
  const okSets = SUBURB_TYPE_SETS[type];
  if (okSets && !okSets.includes(set)) E(`a ${type} room is ${okSets.map((s) => (s === "street" ? "a piece of street" : "a lot")).join(" or ")}, not a ${set}`);
  if (def.role === "start" && set !== "street") E("the manhole is in the street");
  if (def.role === "goal" && set !== "lot") E("Number 9 is a lot");
  // indoor floor belongs to lots; road to the street
  for (let i = 0; i < w * h; i++) {
    if (t.cell[i] !== 1) continue;
    const zt = t.dia.types[t.zone[i]] as SuburbType;
    if (SUBURB_INDOOR_TYPES.includes(zt) && set !== "lot") {
      E(`(${i % w},${(i / w) | 0}) is ${zt} floor: houses and garages stand on lots`);
      break;
    }
    if (zt === "road" && set !== "street") {
      E(`(${i % w},${(i / w) | 0}) is road: roads are the street's`);
      break;
    }
  }
  // doorways: only at the slots, 2 wide, on floor 0, onto outdoor floor
  const ok = new Set<string>();
  for (const x of suburbSlotStart(w)) ok.add(`${x},0,N`), ok.add(`${x},${h - 1},S`);
  for (const y of suburbSlotStart(h)) ok.add(`0,${y},W`), ok.add(`${w - 1},${y},E`);
  for (const s of t.sockets) {
    const tag = `door at (${s.x},${s.y}) ${SIDE_CH[s.side]}`;
    if (s.w !== SLOT_W || !ok.has(`${s.x},${s.y},${SIDE_CH[s.side]}`)) E(`${tag}: a Suburbs doorway is a slot — ${SLOT_W} wide, ${SLOT_AT} cells into its ${MODULE}-cell module side`);
    if (s.prof.some((z) => z !== 0)) E(`${tag}: a doorway stands on floor 0`);
    if (SUBURB_INDOOR_TYPES.includes(t.dia.types[t.zone[I(s.x, s.y)]] as SuburbType)) E(`${tag}: a lot opens onto its yard, never straight into a house`);
  }
  if (t.sockets.length < 2 && !["start", "goal"].includes(def.role) && set === "lot") W("a lot with one gate is a dead end — give it a second slot if you can");
  // the set pieces: one each in its own role's rooms, none elsewhere, with
  // clear floor in front of it
  const nameOf = (k: string): string => SUBURB_GLYPHS[Object.keys(SUBURB_GLYPHS).find((g) => SUBURB_GLYPHS[g].k === k)!].label;
  for (const [k, role] of Object.entries(PIECE_ROLE)) {
    const list = t.pieces.filter((p) => p.k === k);
    if (def.role === role && list.length !== 1) E(`a ${role} room carries exactly one: ${nameOf(k)}`);
    if (def.role !== role && list.length) E(`only a ${role} room carries ${nameOf(k)}`);
  }
  const indoor = (i: number): boolean => SUBURB_INDOOR_TYPES.includes(t.dia.types[t.zone[i]] as SuburbType);
  for (const p of t.pieces) {
    const k = p.k;
    if (k === "key" && !indoor(I(p.x, p.y))) E(`${nameOf(k)} at (${p.x},${p.y}): the key lies indoors (house or garage floor)`);
    if ((k === "lamp" || k === "dead" || k === "flicker") && indoor(I(p.x, p.y))) E(`${nameOf(k)} at (${p.x},${p.y}): a streetlight stands outdoors`);
    if (k === "porch" && def.role !== "goal") E(`${nameOf(k)} at (${p.x},${p.y}): only Number 9's porch light is lit`);
    if (FRONT[k] === undefined) continue;
    if (WALL_PIECES.has(k) && t.hgt[I(p.x, p.y)] !== 0) E(`${nameOf(k)} at (${p.x},${p.y}): it stands on floor 0`);
    const back = p.o as Side;
    for (let q = 0; q <= FRONT[k]; q++) {
      const x = WALL_PIECES.has(k) ? p.x - DX[back] * q : p.x;
      const y = WALL_PIECES.has(k) ? p.y - DY[back] * q : p.y;
      const solidOrOut = x < 0 || y < 0 || x >= w || y >= h || t.cell[I(x, y)] !== 1;
      if (solidOrOut) E(`${nameOf(k)} at (${p.x},${p.y}): ${q ? `the ${q === 1 ? "cell" : "two cells"} in front of it must be` : "it must stand on"} clear floor`);
    }
  }
  // the manhole is at the room's outer edge (it goes on the map's rim)
  for (const d of t.pieces.filter((p) => p.k === "entrance")) {
    const onRim = d.o === 0 ? d.y === 0 : d.o === 2 ? d.y === h - 1 : d.o === 3 ? d.x === 0 : d.x === w - 1;
    if (!onRim) E(`the manhole at (${d.x},${d.y}) must stand against the room's outer edge (it goes on the map's rim)`);
  }
  if (set === "street" && def.role === "block") {
    const road = t.cell.some((cc, i) => cc === 1 && t.dia.types[t.zone[i]] === "road");
    if (!road) E("a street piece carries road");
    if (STREET_TYPES.includes(type) === false) E("a street piece is road or sidewalk");
  }
  if (type === "house" && !t.pieces.some((p) => p.k === "porchdead")) W("a house lot marks its front with a dead porch light (p) by the front door — the planner turns the front to the street");
  if (set === "street" && !t.pieces.some((p) => LIGHTS.has(p.k))) W("no streetlight on this piece of street (draw *, = or ~)");
}

/** The Suburbs' dialect. */
export const SUBURB_DIALECT: Dialect = {
  level: 9,
  types: SUBURB_TYPES,
  zones: SUBURB_ZONES,
  glyphs: SUBURB_GLYPHS,
  groups: SUBURB_GLYPH_GROUPS,
  sets: SUBURB_SETS,
  roles: SUBURB_ROLES,
  blocks: {},
  solidLine: new Set(),
  wallBacked: WALL_PIECES,
  needsRock: new Set(),
  riserBacked: new Set(),
  doorwayOk: new Set(["lamp", "dead", "flicker"]),
  axisKinds: new Set(),
  maxDoorWidth: SLOT_W,
  axisOf: () => 0,
  pieceByte: (p) => BYTE[p.k]?.(p) ?? 0,
  stairByte: () => 0,
  step: (a, b) => Math.abs(a - b) <= 1,
  skipCell: () => false,
  lint: suburbLint,
};

/** Parse a Suburbs room (see tiles.ts). */
export function parseSuburbTile(def: TileDef, lint?: Lint): Tile {
  return parseAny(def, SUBURB_DIALECT, lint);
}

/** Everything wrong with a Suburbs room. */
export function lintSuburbTile(def: TileDef): Lint & { tile: Tile } {
  return lintAny(def, SUBURB_DIALECT);
}
